import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DeleteAccountSchema = z.object({
  password: z.string().min(6),
});

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { password } = DeleteAccountSchema.parse(body);

    // Verify password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    });

    if (signInError) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 400 });
    }

    // Get user's tag
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, tag')
      .eq('id', user.id)
      .single();

    if (profile) {
      // Reserve the tag
      await supabase
        .from('reserved_tags')
        .insert([
          {
            username: profile.username,
            tag: profile.tag,
          },
        ]);

      // Soft delete the profile
      await supabase
        .from('profiles')
        .update({
          username: '[deleted user]',
          deleted_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    }

    // Delete from auth
    await supabase.auth.admin.deleteUser(user.id);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
