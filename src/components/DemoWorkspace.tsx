import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DEMO_PIPELINE_FULL, DEMO_TRANSACTIONS } from '@/lib/demoData';
import { formatCurrency } from '@/lib/utils';

const agents = [
  { name: 'Alex Morgan', volume: 8400000, gci: 210000, goal: 10000000, conversations: 32, appointments: 5 },
  { name: 'Jordan Lee', volume: 6200000, gci: 155000, goal: 8000000, conversations: 26, appointments: 4 },
  { name: 'Taylor Brooks', volume: 5100000, gci: 127500, goal: 7000000, conversations: 21, appointments: 3 },
];

function DemoProduction({ team }: { team: boolean }) {
  const gci = team ? agents.reduce((sum, agent) => sum + agent.gci, 0) : agents[0].gci;
  const volume = team ? agents.reduce((sum, agent) => sum + agent.volume, 0) : agents[0].volume;
  const metrics = [
    ['Closed GCI', formatCurrency(gci)], ['Pending GCI', formatCurrency(team ? 96200 : 32100)],
    ['Closed Volume', formatCurrency(volume)], ['Pending Volume', formatCurrency(team ? 3848000 : 1284000)],
    ['Closed Homes', team ? '28' : '12'], ['Pending Homes', team ? '6' : '2'],
  ];
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(([label, value]) => (
    <Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-semibold text-foreground">{value}</CardContent></Card>
  ))}</div>;
}

function DemoTeam({ coaching = false }: { coaching?: boolean }) {
  return <div className="overflow-x-auto"><Table>
    <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>{coaching ? 'Conversations' : 'Closed Volume'}</TableHead>
      <TableHead>{coaching ? 'Appointments Held' : 'Closed GCI'}</TableHead><TableHead>{coaching ? 'Practice Score' : 'Volume Goal'}</TableHead></TableRow></TableHeader>
    <TableBody>{agents.map(agent => <TableRow key={agent.name}><TableCell>{agent.name}</TableCell>
      <TableCell>{coaching ? agent.conversations : formatCurrency(agent.volume)}</TableCell>
      <TableCell>{coaching ? agent.appointments : formatCurrency(agent.gci)}</TableCell>
      <TableCell>{coaching ? '26 / 30' : formatCurrency(agent.goal)}</TableCell></TableRow>)}</TableBody>
  </Table></div>;
}

function DemoPipeline() {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>
    <TableHead>Client</TableHead><TableHead>Property</TableHead><TableHead>Projected Sale Price</TableHead><TableHead>Projected GCI</TableHead><TableHead>Expected Pending Date</TableHead>
  </TableRow></TableHeader><TableBody>{DEMO_PIPELINE_FULL.map(client => <TableRow key={client.id}>
    <TableCell>{client.client_name}</TableCell><TableCell>{client.property_address}</TableCell>
    <TableCell>{formatCurrency(client.projected_sale_amount)}</TableCell><TableCell>{formatCurrency(client.projected_gci)}</TableCell>
    <TableCell className="whitespace-nowrap">{client.expected_pending_date}</TableCell>
  </TableRow>)}</TableBody></Table></div>;
}

function DemoTransactions() {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>
    <TableHead>Client</TableHead><TableHead>Property</TableHead><TableHead>Status</TableHead><TableHead>GCI</TableHead>
  </TableRow></TableHeader><TableBody>{DEMO_TRANSACTIONS.map(deal => <TableRow key={deal.id}>
    <TableCell>{deal.clientName}</TableCell><TableCell>{deal.propertyAddress}</TableCell><TableCell>{deal.status}</TableCell>
    <TableCell>{formatCurrency(deal.grossCommission)}</TableCell>
  </TableRow>)}</TableBody></Table></div>;
}

function DemoCompany() {
  return <div className="space-y-6"><DemoProduction team />
    <Tabs defaultValue="team411">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="team411">Team Coaching</TabsTrigger><TabsTrigger value="pipeline">Pipeline &amp; Sales</TabsTrigger>
        <TabsTrigger value="team">Team Performance</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="team411"><DemoTeam coaching /></TabsContent>
      <TabsContent value="pipeline"><DemoPipeline /><DemoTransactions /></TabsContent>
      <TabsContent value="team"><DemoTeam /></TabsContent>
      <TabsContent value="analytics"><DemoTeam /></TabsContent>
    </Tabs>
  </div>;
}

// Local fixtures only: live routes must never mount underneath this workspace.
export default function DemoWorkspace() {
  const { pathname } = useLocation();
  const page = pathname.replace(/^\/dashboard\/?/, '');
  let title = 'Demo';
  let content = <p className="text-muted-foreground">No example records for this page.</p>;
  if (!page) {
    title = 'Dashboard'; content = <><DemoProduction team={false} /><DemoPipeline /></>;
  } else if (page === 'admin') {
    title = 'Company Dashboard'; content = <DemoCompany />;
  } else if (page === 'pipeline') {
    title = 'Pipeline'; content = <DemoPipeline />;
  } else if (page === 'commissions') {
    title = 'Transactions'; content = <DemoTransactions />;
  } else if (['goals', 'business-planning', 'admin/business-planning'].includes(page)) {
    title = page === 'goals' ? 'Goals' : 'Business Planning'; content = <DemoTeam />;
  } else if (['411', 'activities', 'admin/coaching-notes'].includes(page)) {
    title = 'Weekly Coaching'; content = <DemoTeam coaching />;
  } else if (page === 'reports') {
    title = 'Reports'; content = <><DemoProduction team /><DemoTeam /></>;
  }
  return <section className="space-y-6"><div><h1 className="text-2xl font-display text-foreground">{title}</h1>
    <p className="text-sm text-muted-foreground">Example data · Read-only</p></div>{content}</section>;
}