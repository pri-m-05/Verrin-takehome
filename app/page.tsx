import { DashboardClient } from "../components/dashboard-client";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero hero-minimal">
        <h1>Verrin</h1>
        <p>One brief in. Repository, code, push, and preview out.</p>
      </section>

      <DashboardClient />
    </main>
  );
}
