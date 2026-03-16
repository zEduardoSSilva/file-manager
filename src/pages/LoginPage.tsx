"use client"

import React, { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Navigate, useNavigate } from "react-router-dom"
import { Loader2, Eye, EyeOff, Truck, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type Mode = "login" | "register"

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/invalid-credential":     "E-mail ou senha incorretos.",
  "auth/user-not-found":         "Nenhuma conta encontrada com este e-mail.",
  "auth/wrong-password":         "Senha incorreta.",
  "auth/email-already-in-use":   "Este e-mail já está cadastrado.",
  "auth/weak-password":          "A senha deve ter pelo menos 6 caracteres.",
  "auth/invalid-email":          "E-mail inválido.",
  "auth/too-many-requests":      "Muitas tentativas. Tente novamente mais tarde.",
  "auth/network-request-failed": "Erro de conexão. Verifique sua internet.",
}

function getErrorMessage(error: any): string {
  const code = error?.code as string
  return FIREBASE_ERRORS[code] ?? "Ocorreu um erro inesperado. Tente novamente."
}

export function LoginPage() {
  const { login, register, currentUser } = useAuth()
  const navigate = useNavigate()

  const [mode,     setMode]     = useState<Mode>("login")
  const [name,     setName]     = useState("")
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // ✅ Se já está logado, redireciona direto para home
  if (currentUser) {
    return <Navigate to="/" replace />
  }

  const switchMode = (m: Mode) => {
    setMode(m); setError(null)
    setName(""); setEmail(""); setPassword(""); setConfirm("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === "register") {
      if (!name.trim())            return setError("Informe seu nome.")
      if (password !== confirm)    return setError("As senhas não coincidem.")
      if (password.length < 6)     return setError("A senha deve ter pelo menos 6 caracteres.")
    }

    setLoading(true)
    try {
      if (mode === "login") {
        await login(email, password)
      } else {
        await register(name.trim(), email, password)
      }
      // ✅ Redireciona para home após login/cadastro com sucesso
      navigate("/", { replace: true })
    } catch (err: any) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── Painel esquerdo — identidade ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-col justify-between
                      bg-primary/5 border-r border-border/60 px-12 py-14 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="size-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">VFleet</span>
        </div>

        {/* Texto central */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                          bg-primary/10 border border-primary/20 text-[11px]
                          font-semibold uppercase tracking-widest text-primary">
            Gestão de Entregas
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight text-foreground">
            Controle total<br />
            <span className="text-primary">da sua frota.</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Consolide rotas, acompanhe motoristas e analise o desempenho
            de todas as filiais em tempo real.
          </p>
        </div>

        {/* Cards decorativos */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Entregas monitoradas", value: "100%"      },
            { label: "Filiais conectadas",   value: "Multi"     },
            { label: "Atualização",          value: "Real-time" },
            { label: "Exportação",           value: "Excel"     },
          ].map(item => (
            <div key={item.label}
              className="rounded-xl border border-border/60 bg-background/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                {item.label}
              </p>
              <p className="text-lg font-bold text-foreground mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Painel direito — formulário ───────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] space-y-8">

          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Truck className="size-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold">VFleet</span>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Entre com suas credenciais para acessar o sistema."
                : "Preencha os dados abaixo para criar seu acesso."}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg border border-border/60 p-1 bg-muted/30">
            {(["login", "register"] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "flex-1 rounded-md py-2 text-xs font-semibold transition-all",
                  mode === m
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "login" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nome completo</Label>
                <Input
                  placeholder="Seu nome"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="h-10 text-sm"
                  required
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">E-mail</Label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-10 text-sm"
                required
                autoFocus={mode === "login"}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Senha</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder={mode === "register" ? "Mínimo 6 caracteres" : "••••••••"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-10 text-sm pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Confirmar senha</Label>
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Repita a senha"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className={cn(
                    "h-10 text-sm",
                    confirm && confirm !== password && "border-destructive focus-visible:ring-destructive"
                  )}
                  required
                />
                {confirm && confirm !== password && (
                  <p className="text-[11px] text-destructive">As senhas não coincidem.</p>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30
                              bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 font-semibold"
              disabled={loading || (mode === "register" && !!confirm && confirm !== password)}
            >
              {loading
                ? <><Loader2 className="size-4 animate-spin mr-2" />Aguarde...</>
                : mode === "login" ? "Entrar" : "Criar conta"
              }
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            {mode === "login" ? "Não tem uma conta? " : "Já tem uma conta? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              {mode === "login" ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}