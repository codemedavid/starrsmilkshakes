// scripts/create-super-admin.ts
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

async function main() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const passwordIdx = args.indexOf('--password');

  if (emailIdx === -1 || passwordIdx === -1) {
    console.error('Usage: npx ts-node scripts/create-super-admin.ts --email <email> --password <password>');
    process.exit(1);
  }

  const email = args[emailIdx + 1];
  const password = args[passwordIdx + 1];

  if (!email || !password) {
    console.error('Email and password are required');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const passwordHash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from('super_admins')
    .insert({ email: email.toLowerCase().trim(), password_hash: passwordHash })
    .select('id, email')
    .single();

  if (error) {
    console.error('Failed to create super admin:', error.message);
    process.exit(1);
  }

  console.log(`Super admin created: ${data.email} (ID: ${data.id})`);
}

main();
