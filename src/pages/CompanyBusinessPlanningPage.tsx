import CompanyBusinessPlanning from '@/components/CompanyBusinessPlanning';

const CompanyBusinessPlanningPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Company Business Planning</h1>
        <p className="text-muted-foreground text-sm">Company-level production targets, goal coverage, and recruiting requirements.</p>
      </div>
      <CompanyBusinessPlanning />
    </div>
  );
};

export default CompanyBusinessPlanningPage;
