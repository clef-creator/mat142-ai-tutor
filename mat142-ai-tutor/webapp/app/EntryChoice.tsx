'use client';

import { useState } from 'react';
import GoogleSignInButton from './GoogleSignInButton';
import SignInForm from './SignInForm';

type Role = 'student' | 'admin';

export default function EntryChoice({ signedIn, studentReady, googleEnabled }: {
  signedIn: boolean;
  studentReady: boolean;
  googleEnabled: boolean;
}) {
  const [role, setRole] = useState<Role | null>(null);

  function choose(next: Role) {
    if (next === 'admin' && signedIn) {
      window.location.assign('/dashboard');
      return;
    }
    if (next === 'student' && studentReady) {
      window.location.assign('/tutor');
      return;
    }
    setRole(next);
  }

  return (
    <div className="entry">
      <h1>Welcome to Calcu-Buddy</h1>
      <p className="entry-lede">Choose where you would like to go.</p>
      <div className="entry-cards">
        <button className={`entry-card${role === 'student' ? ' selected' : ''}`}
          type="button" onClick={() => choose('student')}>
          <span className="entry-card-title">Enter as a student</span>
          <span>Practice calculus with your tutor.</span>
        </button>
        <button className={`entry-card${role === 'admin' ? ' selected' : ''}`}
          type="button" onClick={() => choose('admin')}>
          <span className="entry-card-title">Enter as an admin</span>
          <span>View the course dashboard. Approved accounts only.</span>
        </button>
      </div>
      {role ? (
        <div className="signin entry-signin">
          <h2>{role === 'admin' ? 'Admin sign in' : 'Student sign in'}</h2>
          {role === 'student' ? (
            googleEnabled ? (
              <>
                <p className="lede">Use your Ahmedabad University Google account.</p>
                <GoogleSignInButton role="student" />
              </>
            ) : <p className="lede">University Google sign-in is not enabled yet.</p>
          ) : (
            <>
              {googleEnabled ? <GoogleSignInButton role="admin" /> : null}
              <details open={!googleEnabled} className="admin-password">
                <summary>Sign in with a faculty password</summary>
                <SignInForm />
              </details>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
