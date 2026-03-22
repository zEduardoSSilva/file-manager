
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/lib/types';
import { UserRole, ROLE_LABELS } from '@/lib/user-roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PlusCircle, Edit, Trash2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<UserProfile> | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as UserProfile[];
      setUsers(userList);
    } catch (err) {
      console.error("Erro ao buscar usuários: ", err);
      setError("Não foi possível carregar os usuários. Verifique as permissões do Firestore.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const userRoleChartData = useMemo(() => {
    const roleCounts = users.reduce((acc, user) => {
      const roleName = ROLE_LABELS[user.role] || capitalize(user.role);
      acc[roleName] = (acc[roleName] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(roleCounts).map(([name, count]) => ({ name, Usuários: count }));
  }, [users]);

  const handleSaveUser = async () => {
    if (!currentUser || !currentUser.nome || !currentUser.email || !currentUser.role) {
        alert("Por favor, preencha todos os campos.");
        return;
    }
    try {
      if (currentUser.id) {
        const userDoc = doc(db, 'users', currentUser.id);
        const { id, ...dataToUpdate } = currentUser;
        await updateDoc(userDoc, dataToUpdate);
      } else {
        await addDoc(collection(db, 'users'), currentUser);
      }
      setIsDialogOpen(false);
      setCurrentUser(null);
      fetchUsers(); 
    } catch (err) {
      console.error("Erro ao salvar usuário: ", err);
      alert("Ocorreu um erro ao salvar o usuário.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário? A ação não pode ser desfeita.")) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      fetchUsers(); 
    } catch (err) {
      console.error("Erro ao excluir usuário: ", err);
      alert("Ocorreu um erro ao excluir o usuário.");
    }
  };

  const openAddUserDialog = () => {
    setCurrentUser({ nome: '', email: '', role: UserRole.USER, ativo: true });
    setIsDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Visão Administrativa</h1>
            <p className="text-muted-foreground mt-1 text-sm">Gerencie usuários e visualize a distribuição de perfis.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchUsers} disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
            </Button>
             <Button onClick={openAddUserDialog}>
                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Usuário
            </Button>
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader>
            <CardTitle>Usuários por Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="flex items-center justify-center h-[250px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
             </div>
          ) : userRoleChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={userRoleChartData}>
                      <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: 'transparent' }} />
                      <Legend />
                      <Bar dataKey="Usuários" fill="#8884d8" radius={[4, 4, 0, 0]} />
                  </BarChart>
              </ResponsiveContainer>
          ) : (
              !error && <p className='text-center text-muted-foreground'>Nenhum usuário para exibir no gráfico.</p>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive">
          <AlertCircle className="mx-auto w-12 h-12 mb-4" />
          <p>{error}</p>
          <Button onClick={fetchUsers} className="mt-4">Tentar Novamente</Button>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center p-8 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Nenhum usuário encontrado</h3>
            <p className="text-muted-foreground mt-2">Clique em "Adicionar Usuário" para começar.</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Perfil</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.nome}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{ROLE_LABELS[user.role] || capitalize(user.role)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => { setCurrentUser(user); setIsDialogOpen(true); }}>
                    <Edit className="mr-2 h-4 w-4" /> Editar
                  </Button>
                  <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleDeleteUser(user.id!)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{currentUser?.id ? 'Editar Usuário' : 'Adicionar Novo Usuário'}</DialogTitle>
              <DialogDescription>Preencha os detalhes e defina o perfil de acesso.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <Input placeholder="Nome Completo" value={currentUser?.nome || ''} onChange={e => setCurrentUser({ ...currentUser, nome: e.target.value })} />
                <Input type="email" placeholder="email@exemplo.com" value={currentUser?.email || ''} onChange={e => setCurrentUser({ ...currentUser, email: e.target.value })} />
                <Select value={currentUser?.role || ''} onValueChange={value => setCurrentUser({ ...currentUser, role: value as UserRole })}>
                    <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                    <SelectContent>
                        {Object.values(UserRole).map(role => (
                            <SelectItem key={role} value={role}>{ROLE_LABELS[role] || capitalize(role)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveUser}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default UserManagementPage;
