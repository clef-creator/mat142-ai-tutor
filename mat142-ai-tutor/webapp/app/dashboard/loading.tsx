import Header from '@/components/Header';

export default function DashboardLoading() {
  return (
    <>
      <Header subtitle="Professor dashboard" />
      <main className="shell" aria-busy="true">
        <div className="panel panel-b">Loading student signals…</div>
      </main>
    </>
  );
}
