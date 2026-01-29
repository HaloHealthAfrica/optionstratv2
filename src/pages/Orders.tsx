import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  FileText, 
  Search, 
  X, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  DollarSign,
  Activity,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { useHealth } from "@/hooks/useSystemData";
import { ClosedPnLTab } from "@/components/orders/ClosedPnLTab";
import { TradesTab } from "@/components/orders/TradesTab";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

interface Order {
  id: string;
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  option_type: string;
  side: string;
  quantity: number;
  order_type: string | null;
  status: string | null;
  mode: string;
  limit_price: number | null;
  avg_fill_price: number | null;
  filled_quantity: number | null;
  broker_order_id: string | null;
  error_message: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  submitted_at: string | null;
  filled_at: string | null;
  cancelled_at: string | null;
  broker_response: Record<string, unknown> | null;
}

type OrderStatus = 'all' | 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  PENDING: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  SUBMITTED: { icon: Clock, color: 'text-info', bg: 'bg-info/10' },
  PARTIAL: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10' },
  FILLED: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
  CANCELLED: { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/50' },
  REJECTED: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  EXPIRED: { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/50' },
};

export default function OrdersPage() {
  const { data: health } = useHealth();
  const mode = health?.mode || "PAPER";
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<OrderStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Fetch orders
  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Order[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'CANCELLED', 
          cancelled_at: new Date().toISOString() 
        })
        .eq('id', orderId)
        .in('status', ['PENDING', 'SUBMITTED', 'PARTIAL']);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Order cancelled successfully');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      toast.error(`Failed to cancel order: ${error.message}`);
    },
  });

  // Filter orders by search term
  const filteredOrders = orders?.filter(order => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.symbol.toLowerCase().includes(search) ||
      order.underlying.toLowerCase().includes(search) ||
      order.id.toLowerCase().includes(search)
    );
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'MMM d, HH:mm:ss');
  };

  const getStatusBadge = (status: string | null) => {
    const config = statusConfig[status || 'PENDING'] || statusConfig.PENDING;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`${config.bg} ${config.color} border-0`}>
        <Icon className="h-3 w-3 mr-1" />
        {status || 'PENDING'}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Order Management</h1>
              <p className="text-xs text-muted-foreground">
                View and manage all orders and closed P&L
              </p>
            </div>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="orders" className="space-y-6">
          <TabsList>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="trades" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Trades
            </TabsTrigger>
            <TabsTrigger value="closed-pnl" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Closed P&L
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by symbol, underlying, or order ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="FILLED">Filled</SelectItem>
                      <SelectItem value="PARTIAL">Partial</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="EXPIRED">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
              <CardHeader>
                <CardTitle>Orders ({filteredOrders?.length || 0})</CardTitle>
                <CardDescription>
                  Real-time order tracking with automatic status updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
                ) : filteredOrders?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No orders found. Orders will appear here when signals are processed.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Fill</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders?.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{order.underlying}</p>
                                <p className="text-xs text-muted-foreground">
                                  ${order.strike} {order.option_type} {order.expiration}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={order.side === 'BUY' ? 'default' : 'secondary'}>
                                {order.side}
                              </Badge>
                            </TableCell>
                            <TableCell>{order.quantity}</TableCell>
                            <TableCell>
                              <span className="text-xs uppercase">{order.order_type || 'MARKET'}</span>
                            </TableCell>
                            <TableCell>
                              {order.limit_price ? `$${order.limit_price.toFixed(2)}` : 'MKT'}
                            </TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell>
                              {order.filled_quantity && order.avg_fill_price ? (
                                <div className="text-xs">
                                  <p>{order.filled_quantity} @ ${order.avg_fill_price.toFixed(2)}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(order.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setSelectedOrder(order)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>Order Details</DialogTitle>
                                      <DialogDescription>
                                        {order.id}
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <p className="text-sm font-medium">Symbol</p>
                                          <p className="text-sm text-muted-foreground">{order.symbol}</p>
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">Status</p>
                                          <div className="mt-1">{getStatusBadge(order.status)}</div>
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">Side</p>
                                          <p className="text-sm text-muted-foreground">{order.side}</p>
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">Quantity</p>
                                          <p className="text-sm text-muted-foreground">{order.quantity}</p>
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">Mode</p>
                                          <Badge variant="outline">{order.mode}</Badge>
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">Avg Fill Price</p>
                                          <p className="text-sm text-muted-foreground">
                                            {order.avg_fill_price ? `$${order.avg_fill_price.toFixed(2)}` : '-'}
                                          </p>
                                        </div>
                                      </div>
                                      
                                      {/* Timestamps */}
                                      <div className="border-t pt-4">
                                        <p className="text-sm font-medium mb-2">Timeline</p>
                                        <div className="space-y-1 text-sm text-muted-foreground">
                                          <p>Created: {formatDate(order.created_at)}</p>
                                          {order.submitted_at && <p>Submitted: {formatDate(order.submitted_at)}</p>}
                                          {order.filled_at && <p>Filled: {formatDate(order.filled_at)}</p>}
                                          {order.cancelled_at && <p>Cancelled: {formatDate(order.cancelled_at)}</p>}
                                        </div>
                                      </div>

                                      {/* Errors */}
                                      {(order.error_message || order.rejection_reason) && (
                                        <div className="border-t pt-4">
                                          <p className="text-sm font-medium mb-2 text-destructive">Error</p>
                                          <p className="text-sm text-muted-foreground">
                                            {order.rejection_reason || order.error_message}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                                
                                {['PENDING', 'SUBMITTED', 'PARTIAL'].includes(order.status || '') && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => cancelOrderMutation.mutate(order.id)}
                                    disabled={cancelOrderMutation.isPending}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trades">
            <TradesTab />
          </TabsContent>

          <TabsContent value="closed-pnl">
            <ClosedPnLTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
