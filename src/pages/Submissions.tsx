import { SubmissionsTab } from '@/components/submissions/SubmissionsTab';

const Submissions = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Submissions</h1>
          <p className="text-muted-foreground mt-1">Submit open houses, invoices, listings & buyer transactions</p>
        </div>
      </div>

      <SubmissionsTab />
    </div>
  );
};

export default Submissions;
