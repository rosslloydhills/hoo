import { CursorGlowBackground } from '@/components/CursorGlowBackground';
import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <CursorGlowBackground>
      <div className="hoo-loginShell">
        <LoginForm />
      </div>
    </CursorGlowBackground>
  );
}

