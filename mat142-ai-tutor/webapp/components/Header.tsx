import SignOutButton from './SignOutButton';

export default function Header({ email, subtitle }: { email?: string | null; subtitle?: string }) {
  return (
    <>
      <div className="uni">
        <div className="uni-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="uni-logo" src="/au-logo.png" alt="Ahmedabad University" />
          <div className="vr" />
          <div>
            <div className="appname">Calcu&#8209;Buddy</div>
            <div className="appsub">{subtitle ?? 'Your practice partner for MAT142'}</div>
          </div>
          {email ? (
            <div className="uni-right">
              {/* Naming who is signed in matters on a shared lab machine: a
                  student who sees someone else's address knows to sign out. */}
              <span className="who">Signed in as {email}</span>
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </div>
      <div className="coursebar">
        <div className="coursebar-in">
          <span>MAT142 &middot; Introductory Calculus</span>
        </div>
      </div>
    </>
  );
}
