import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/use-app-store';
import { useCreateServer, getListMyServersQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function CreateServerModal() {
  const { createServerModalOpen, setCreateServerModalOpen, setActiveServer } = useAppStore();
  const [name, setName] = useState('');
  const { mutate: createServer, isPending } = useCreateServer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createServer({ data: { name } }, {
      onSuccess: (server) => {
        queryClient.invalidateQueries({ queryKey: getListMyServersQueryKey() });
        setCreateServerModalOpen(false);
        setActiveServer(server.id);
        setName('');
        toast({ title: "Server created!", description: `Welcome to ${server.name}` });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={createServerModalOpen} onOpenChange={setCreateServerModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customize your server</DialogTitle>
          <DialogDescription>
            Give your new server a personality with a name. You can always change it later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Server Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-secondary border-0 p-3 rounded-lg text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="My Awesome Server"
                autoFocus
                maxLength={100}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => setCreateServerModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
