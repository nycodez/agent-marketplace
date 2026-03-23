import Link from "next/link";
import { MonochromeButton, SectionCard } from "@agent-marketplace/ui";

export default function LoginPage() {
  return (
    <div className="page-frame">
      <div className="two-up-grid">
        <SectionCard title="Sign in" eyebrow="Auth">
          <div className="stack">
            <input className="mono-input" placeholder="Email" />
            <input className="mono-input" type="password" placeholder="Password" />
            <div className="row-between">
              <MonochromeButton>Login</MonochromeButton>
              <MonochromeButton variant="secondary">Magic link</MonochromeButton>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="New organization setup" eyebrow="First run">
          <div className="stack">
            <input className="mono-input" placeholder="Your name" />
            <input className="mono-input" placeholder="Organization" />
            <textarea
              className="mono-textarea"
              placeholder="Describe the positions you want filled and the tasks they should own."
            />
            <div className="row-between">
              <MonochromeButton>Create account</MonochromeButton>
              <Link href="/dashboard" className="muted-copy">
                Preview dashboard
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
