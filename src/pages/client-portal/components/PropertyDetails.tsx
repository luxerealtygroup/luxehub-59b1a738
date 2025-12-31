import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Home, DollarSign, Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';

interface Transaction {
  id: string;
  property_address: string;
  transaction_type: string;
  status: string;
  list_price: number | null;
  sale_price: number | null;
  closing_date: string | null;
  property_description: string | null;
  property_photos: string[];
}

interface PropertyDetailsProps {
  transaction: Transaction;
}

export function PropertyDetails({ transaction }: PropertyDetailsProps) {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'TBD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: { label: 'Active', className: 'bg-blue-100 text-blue-700' },
      pending: { label: 'Under Contract', className: 'bg-primary/10 text-primary' },
      closed: { label: 'Closed', className: 'bg-green-100 text-green-700' },
      cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' }
    };
    const config = statusConfig[status] || statusConfig.active;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const photos = Array.isArray(transaction.property_photos) ? transaction.property_photos : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Property Details
          </CardTitle>
          {getStatusBadge(transaction.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Property Photos */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 rounded-lg overflow-hidden">
            {photos.slice(0, 4).map((photo, index) => (
              <div 
                key={index} 
                className={`aspect-video bg-muted ${index === 0 && photos.length > 1 ? 'col-span-2' : ''}`}
              >
                <img 
                  src={photo} 
                  alt={`Property photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Address */}
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{transaction.property_address}</p>
            <p className="text-sm text-muted-foreground capitalize">
              {transaction.transaction_type === 'buyer' ? 'Buying' : 'Selling'}
            </p>
          </div>
        </div>

        {/* Price Info */}
        <div className="grid grid-cols-2 gap-4">
          {transaction.list_price && (
            <div className="flex items-start gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {transaction.transaction_type === 'buyer' ? 'List Price' : 'Your Asking Price'}
                </p>
                <p className="font-semibold text-lg">{formatCurrency(transaction.list_price)}</p>
              </div>
            </div>
          )}
          {transaction.sale_price && (
            <div className="flex items-start gap-3">
              <DollarSign className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {transaction.status === 'closed' ? 'Final Sale Price' : 'Contract Price'}
                </p>
                <p className="font-semibold text-lg text-primary">{formatCurrency(transaction.sale_price)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Closing Date */}
        {transaction.closing_date && (
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
            <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                {transaction.status === 'closed' ? 'Closed On' : 'Expected Closing'}
              </p>
              <p className="font-semibold">
                {format(new Date(transaction.closing_date), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
        )}

        {/* Description */}
        {transaction.property_description && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">About This Property</p>
            <p className="text-sm leading-relaxed">{transaction.property_description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
