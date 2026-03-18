import { useAuth } from '@workspace/replit-auth-web';
import { Button } from '@/components/ui/button';
import { MessageSquare, Shield, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative bg-[#09090b] overflow-hidden">
      {/* Background Image/Gradients */}
      <div className="absolute inset-0 opacity-40 mix-blend-screen">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Abstract Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-card/60 backdrop-blur-xl p-10 rounded-3xl border border-border/50 shadow-2xl shadow-primary/10 relative z-10 text-center flex flex-col items-center"
      >
        <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30 mb-8 transform -rotate-6">
          <MessageSquare size={40} className="text-white transform rotate-6" />
        </div>
        
        <h1 className="text-4xl font-display font-bold text-foreground tracking-tight mb-3">
          Welcome to hollr.
        </h1>
        <p className="text-muted-foreground text-lg mb-10 leading-relaxed max-w-[280px]">
          The premium real-time communication platform for modern teams.
        </p>

        <Button 
          variant="primary" 
          size="lg" 
          onClick={login}
          className="w-full rounded-2xl h-14 text-lg font-bold shadow-xl shadow-indigo-600/25 group"
        >
          Sign in with Replit
          <Zap size={20} className="ml-2 opacity-70 group-hover:opacity-100 transition-opacity" />
        </Button>

        <div className="flex items-center justify-center gap-6 mt-10 text-xs text-muted-foreground/60 font-medium">
          <span className="flex items-center"><Shield size={14} className="mr-1" /> End-to-end Encrypted</span>
        </div>
      </motion.div>
    </div>
  );
}
