
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { fetchUsageHistory, DailyUsage, UserUsage } from '@/lib/firebaseUsageTracker';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { startOfToday, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, AlertCircle, Users, Eye, Edit, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Helper para formatar números grandes
const formatNumber = (num: number) => num.toLocaleString('pt-BR');

export function AdminDashboardPage() {
  const [usageData, setUsageData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await fetchUsageHistory(7); // Puxa os últimos 7 dias
        setUsageData(data);
      } catch (e) {
        setError('Falha ao carregar os dados de uso. Tente novamente mais tarde.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const todaysUsage = useMemo(() => {
    const todayStr = format(startOfToday(), 'yyyy-MM-dd');
    return usageData.find(d => d.date === todayStr);
  }, [usageData]);

  const topUser = useMemo(() => {
    if (!todaysUsage || !todaysUsage.users) return null;

    let topUser: (UserUsage & { id: string }) | null = null;
    let maxReads = -1;

    for (const userId in todaysUsage.users) {
      const userData = todaysUsage.users[userId];
      if (userData.reads > maxReads) {
        maxReads = userData.reads;
        topUser = { ...userData, id: userId };
      }
    }
    return topUser;
  }, [todaysUsage]);

  const chartData = useMemo(() => {
      if (!todaysUsage || !todaysUsage.users) return [];
      return Object.entries(todaysUsage.users)
        .map(([id, user]) => ({ 
            name: user.name?.split(' ')[0] || 'Anônimo',
            Leituras: user.reads, 
            id 
        }))
        .sort((a, b) => b.Leituras - a.Leituras)
        .slice(0, 10); // Top 10 usuários
  }, [todaysUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-3 text-lg font-semibold">Carregando Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-destructive">
        <AlertCircle className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Ocorreu um Erro</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard de Administrador</h1>
        <p className="text-muted-foreground">
          Visão geral do consumo de recursos do Firestore no dia de hoje ({format(new Date(), "dd 'de' MMMM", { locale: ptBR })})
        </p>
      </div>

      {/* === Cards de Métricas Totais === */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Leituras</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(todaysUsage?.totalReads ?? 0)}</div>
            <p className="text-xs text-muted-foreground">+0% que ontem</p> {/* Placeholder */}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Escritas</CardTitle>
            <Edit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(todaysUsage?.totalWrites ?? 0)}</div>
             <p className="text-xs text-muted-foreground">+0% que ontem</p> {/* Placeholder */}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Exclusões</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(todaysUsage?.totalDeletes ?? 0)}</div>
             <p className="text-xs text-muted-foreground">+0% que ontem</p> {/* Placeholder */}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Ativos (hoje)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(Object.keys(todaysUsage?.users || {}).length)}</div>
            <p className="text-xs text-muted-foreground">Usuários que fizeram ao menos 1 operação</p>
          </CardContent>
        </Card>
      </div>

      {/* === Gráfico de Consumo por Usuário === */}
      <Card>
          <CardHeader>
              <CardTitle>Top 10 Usuários por Leituras (Hoje)</CardTitle>
              <p className="text-sm text-muted-foreground">
                  Gráfico mostrando os usuários que mais realizaram leituras no dia.
              </p>
          </CardHeader>
          <CardContent>
             {chartData.length > 0 ? (
                 <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <XAxis 
                            dataKey="name" 
                            stroke="#888888" 
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis 
                            stroke="#888888" 
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${formatNumber(value as number)}`}
                        />
                        <Tooltip 
                            cursor={{fill: 'rgba(12, 12, 12, 0.05)'}}
                            contentStyle={{ 
                                background: 'rgba(255, 255, 255, 0.9)', 
                                border: '1px solid #ccc', 
                                borderRadius: '8px',
                                backdropFilter: 'blur(5px)'
                             }}
                        />
                        <Legend wrapperStyle={{fontSize: "14px"}} />
                        <Bar dataKey="Leituras" fill="#8884d8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
             ) : (
                <div className="flex flex-col items-center justify-center h-[350px]">
                    <p className='text-muted-foreground'>Nenhum dado de leitura de usuário registrado hoje.</p>
                </div>
             )}
          </CardContent>
      </Card>

    </div>
  );
}
