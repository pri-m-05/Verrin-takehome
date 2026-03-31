import { JobRunView } from "@/components/job-run-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="page-shell page-shell-run">
      <JobRunView jobId={id} />
    </main>
  );
}
