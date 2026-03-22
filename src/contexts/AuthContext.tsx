import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  onAuthStateChanged, User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Loader2 } from 'lucide-react'
// Importa auth e db do arquivo central — sem duplicar config aqui.
import { auth, db } from '@/lib/firebase-app'

interface AuthContextType {
  currentUser: User | null
  userRole:    string | null
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
  const [userRole,    setUserRole]    = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user)
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role || 'user')
          } else {
            // Se o documento não existe, inicializa com o perfil 'user' na base
            await setDoc(doc(db, 'users', user.uid), {
              email: user.email,
              name: user.displayName || '',
              role: 'user'
            })
            setUserRole('user')
          }
        } catch (err) {
          console.error("Erro ao buscar usuário do Firestore:", err)
          setUserRole('user')
        }
      } else {
        setCurrentUser(null)
        setUserRole(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const register = async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    
    // Garante criação rápida no Firestore antes mesmo do useEffect completar
    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      name,
      role: 'user'
    })

    setCurrentUser({ ...cred.user, displayName: name } as User)
    setUserRole('user')
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
        <p className="ml-3 text-lg font-semibold">Carregando permissões...</p>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ currentUser, userRole, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}