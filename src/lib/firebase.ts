/**
 * Firebase setup for Aral.
 *
 * Config comes from import.meta.env (VITE_FIREBASE_* vars). When any
 * required var is missing, initFirebase returns null and the app runs
 * on the demo provider instead. No keys are invented or hardcoded.
 *
 * Products wired: AI Logic (hybrid inference), Auth (anonymous),
 * Firestore (study set sync), Remote Config (routing thresholds),
 * App Check (debug token in dev only, when a site key is configured).
 */

import { initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai'
import type { AI, GenerativeModel } from 'firebase/ai'
import { getAuth, signInAnonymously } from 'firebase/auth'
import type { Auth, User } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config'
import type { RemoteConfig } from 'firebase/remote-config'
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { FirebaseAIProvider } from './inference'
import type { InferenceProvider } from './inference'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

export interface RoutingSettings {
  maxOnDeviceChars: number
  cloudThresholdChars: number
}

export interface FirebaseServices {
  app: FirebaseApp
  ai: AI
  model: GenerativeModel
  provider: InferenceProvider
  auth: Auth
  user: User | null
  db: Firestore
  remoteConfig: RemoteConfig
  settings: RoutingSettings
}

export const DEFAULT_SETTINGS: RoutingSettings = {
  maxOnDeviceChars: 8000,
  cloudThresholdChars: 6000,
}

/** Read Firebase config from env. Returns null when incomplete. */
export function readFirebaseConfig(): FirebaseConfig | null {
  const env = import.meta.env
  const apiKey = env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  const projectId = env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
  const appId = env.VITE_FIREBASE_APP_ID as string | undefined
  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    return null
  }
  const measurementId = env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
  }
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null
}

let cachedServices: FirebaseServices | null = null
let initPromise: Promise<FirebaseServices | null> | null = null

/**
 * Initialize Firebase once and cache the services.
 * Returns null when no config is present. Sign-in and Remote Config
 * failures are logged and tolerated; the app keeps working with
 * defaults and anonymous features disabled.
 */
export async function initFirebase(): Promise<FirebaseServices | null> {
  if (cachedServices !== null) {
    return cachedServices
  }
  if (initPromise !== null) {
    return initPromise
  }
  initPromise = initFirebaseOnce()
  return initPromise
}

async function initFirebaseOnce(): Promise<FirebaseServices | null> {

  const config = readFirebaseConfig()
  if (config === null) {
    return null
  }

  const app = initializeApp(config)

  // App Check: AI Logic enforcement is on, so App Check must be
  // initialized or AI Logic calls are rejected. In dev, always
  // initialize with the debug token. The SDK short-circuits token
  // retrieval to the debug token when FIREBASE_APPCHECK_DEBUG_TOKEN
  // is set, so the provider below is never called in dev. The debug
  // token printed in DevTools must be registered in the Firebase
  // console (App Check > Manage debug tokens). In production, a
  // reCAPTCHA Enterprise site key is required; without one App Check
  // stays off and AI Logic calls will fail, which is a setup gap
  // to close before the hosted deploy, not a silent fallback.
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY as string | undefined
  if (import.meta.env.DEV) {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    const provider = siteKey
      ? new ReCaptchaEnterpriseProvider(siteKey)
      : new CustomProvider({
          getToken: () =>
            Promise.reject(
              new Error(
                'App Check has no token source in dev. Register the debug token in the Firebase console.',
              ),
            ),
        })
    initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    })
  } else if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  }

  const auth = getAuth(app)
  let user: User | null = auth.currentUser
  try {
    const credential = await signInAnonymously(auth)
    user = credential.user
  } catch (error) {
    console.warn('Anonymous sign-in failed. Sync stays off.', error)
    user = null
  }

  const db = getFirestore(app)

  const remoteConfig = getRemoteConfig(app)
  remoteConfig.settings.minimumFetchIntervalMillis = 3600000
  remoteConfig.defaultConfig = {
    max_on_device_chars: String(DEFAULT_SETTINGS.maxOnDeviceChars),
    cloud_threshold_chars: String(DEFAULT_SETTINGS.cloudThresholdChars),
  }
  let settings: RoutingSettings = { ...DEFAULT_SETTINGS }
  try {
    await fetchAndActivate(remoteConfig)
    const maxOnDevice = getValue(remoteConfig, 'max_on_device_chars').asNumber()
    const cloudThreshold = getValue(remoteConfig, 'cloud_threshold_chars').asNumber()
    settings = {
      maxOnDeviceChars:
        Number.isFinite(maxOnDevice) && maxOnDevice > 0
          ? maxOnDevice
          : DEFAULT_SETTINGS.maxOnDeviceChars,
      cloudThresholdChars:
        Number.isFinite(cloudThreshold) && cloudThreshold > 0
          ? cloudThreshold
          : DEFAULT_SETTINGS.cloudThresholdChars,
    }
  } catch (error) {
    console.warn('Remote Config fetch failed. Using defaults.', error)
  }

  const ai = getAI(app, { backend: new GoogleAIBackend() })
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: { model: 'gemini-3.5-flash-lite' },
  })

  cachedServices = {
    app,
    ai,
    model,
    provider: new FirebaseAIProvider(model),
    auth,
    user,
    db,
    remoteConfig,
    settings,
  }
  return cachedServices
}

/**
 * Return the Firebase inference provider when Firebase was initialized,
 * or null when no config exists. Call initFirebase first.
 */
export function getModel(): InferenceProvider | null {
  return cachedServices?.provider ?? null
}

/** Return cached services, or null when Firebase was never initialized. */
export function getServices(): FirebaseServices | null {
  return cachedServices
}
