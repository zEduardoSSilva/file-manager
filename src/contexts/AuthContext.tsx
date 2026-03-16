import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  getAuth, onAuthStateChanged, User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { Loader2 } from 'lucide-react'

const firebaseConfig = {
  apiKey:            "AIzaSyDj733yNRCHjua7X-0rkHc74VA4qkDpg9w",
  authDomain:        "file-manager-hub-50030335.firebaseapp.com",
  projectId:         "file-manager-hub-50030335",
  storageBucket:     "file-manager-hub-50030335.firebasestorage.app",
  messagingSenderId: "187801013388",
  appId:             "1:187801013388:web:ef1417fae5d8d24d93ffa9",
}

const app  = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const auth = getAuth(app)

interface AuthContextType {
  currentUser: User | null
  loading:     boolean
  register:    (name: string, email: string, password: string) => Promise<void>
  login:       (email: string, password: string) => Promise<void>
  logout:      () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const register = async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    // Força atualização local do displayName
    setCurrentUser({ ...cred.user, displayName: name } as User)
  }

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const logout = async () => {
    await signOut(auth)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-3 text-lg font-semibold">Carregando...</p>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ currentUser, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}