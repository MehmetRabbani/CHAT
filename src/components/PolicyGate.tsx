import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function PolicyGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [isLoading, setIsLoading] = useState(true);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkPolicy = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          setUserId(data.session.user.id);

          const { data: profile } = await supabase
            .from('profiles')
            .select('policy_accepted_at')
            .eq('id', data.session.user.id)
            .single();

          if (!profile?.policy_accepted_at) {
            setNeedsApproval(true);
          }
        }
      } catch (error) {
        console.error('Error checking policy:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkPolicy();
  }, []);

  const handleAcceptPolicy = async () => {
    if (!userId) return;

    try {
      await supabase
        .from('profiles')
        .update({ policy_accepted_at: new Date().toISOString() })
        .eq('id', userId);
      setNeedsApproval(false);
    } catch (error) {
      console.error('Error accepting policy:', error);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <>
      <AlertDialog open={needsApproval}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogTitle>{t('policy.title')}</AlertDialogTitle>
          <AlertDialogDescription className="text-base space-y-4">
            <p>{t('policy.description')}</p>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>• {t('policy.terms')}</p>
              <p>• {t('policy.privacy')}</p>
            </div>
          </AlertDialogDescription>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAcceptPolicy} className="flex-1">
              {t('policy.agree')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {!needsApproval && children}
    </>
  );
}
