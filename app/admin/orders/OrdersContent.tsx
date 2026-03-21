'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Truck,
  CheckSquare,
  Square,
  ExternalLink,
  DollarSign,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { Order, OrderStatus, OrderFilters } from '@/types';
import CustomerLinkWidget from '@/components/CustomerLinkWidget';

interface Branch {
  id: string;
  name: string;
}

interface OrdersContentProps {
  initialOrders: Order[];
  branches: Branch[];
  adminType: 'admin' | 'super_admin';
}

export default function OrdersContent({ initialOrders, branches, adminType }: OrdersContentProps) {
  const { orders: liveOrders, loading, fetchOrders, updateOrderStatus, bulkUpdateStatus, getOrderStats } = useOrders({ admin: true });

  // Use initialOrders until the hook has loaded its own data
  const orders = loading ? initialOrders : liveOrders;

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [filters, setFilters] = useState<OrderFilters>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'all' | 'dine-in' | 'pickup' | 'delivery'>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    total_orders: 0,
    pending_orders: 0,
    today_orders: 0,
    today_revenue: 0,
    completed_orders: 0,
    cancelled_orders: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isRealTimeActive] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isInitialMount = useRef(true);

  const loadStats = useCallback(async () => {
    try {
      const orderStats = await getOrderStats();
      setStats(orderStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [getOrderStats]);

  // Apply filters whenever filter values change
  useEffect(() => {
    const applyFilters = async () => {
      const newFilters: OrderFilters = {};

      if (statusFilter !== 'all') {
        newFilters.status = statusFilter;
      }
      if (serviceTypeFilter !== 'all') {
        newFilters.service_type = serviceTypeFilter;
      }
      if (searchTerm) {
        newFilters.search = searchTerm;
      }

      const now = new Date();
      if (dateFilter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        newFilters.date_from = today.toISOString();
        newFilters.date_to = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
      } else if (dateFilter === 'week') {
        newFilters.date_from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateFilter === 'month') {
        newFilters.date_from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      setFilters(newFilters);
      await fetchOrders(newFilters);
    };

    if (!isInitialMount.current) {
      void applyFilters();
    } else {
      isInitialMount.current = false;
      void applyFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, serviceTypeFilter, searchTerm, dateFilter]);

  // Load stats on mount and refresh every 10 s while real-time is active
  useEffect(() => {
    void loadStats();

    const statsInterval = setInterval(() => {
      if (isRealTimeActive) {
        void loadStats();
      }
    }, 10_000);

    return () => clearInterval(statsInterval);
  }, [isRealTimeActive, loadStats]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      setIsProcessing(true);
      await updateOrderStatus(orderId, newStatus);
      setSelectedOrders([]);
      await loadStats();
      await fetchOrders(filters);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update order status');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadStats(), fetchOrders(filters)]);
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBulkStatusChange = async (newStatus: OrderStatus) => {
    if (selectedOrders.length === 0) {
      alert('Please select orders to update');
      return;
    }
    if (confirm(`Are you sure you want to update ${selectedOrders.length} order(s) to "${newStatus}"?`)) {
      try {
        setIsProcessing(true);
        await bulkUpdateStatus(selectedOrders, newStatus);
        setSelectedOrders([]);
        loadStats().catch((err) => console.error('Error loading stats:', err));
        alert(`Successfully updated ${selectedOrders.length} order(s)`);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to update orders');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map((o) => o.id));
    }
  };

  // Client-side branch filter applied on top of hook results
  const displayedOrders =
    branchFilter === 'all' ? orders : orders.filter((o) => o.branch_id === branchFilter);

  const getStatusColor = (status: OrderStatus): string => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
      preparing: 'bg-orange-100 text-orange-800 border-orange-200',
      ready: 'bg-green-100 text-green-800 border-green-200',
      out_for_delivery: 'bg-purple-100 text-purple-800 border-purple-200',
      completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    return colors[status] ?? 'bg-stone-100 text-stone-800 border-stone-200';
  };

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const statusOptions: OrderStatus[] = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery',
    'completed',
    'cancelled',
  ];

  const formatStatusLabel = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">Order Management</h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">
              {displayedOrders.length} {displayedOrders.length === 1 ? 'order' : 'orders'} found
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="
                inline-flex items-center gap-2 px-4 py-2
                font-nunito text-sm font-medium text-stone-700
                bg-white border border-[#E8E3DA] rounded-[10px]
                hover:bg-[#F2EEE8] active:bg-[#E8E3DA]
                transition-colors duration-200 disabled:opacity-50
              "
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-nunito text-sm text-emerald-700 font-medium">Live</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Orders', value: stats.total_orders, icon: Package, iconBg: 'bg-[#7BBFB5]/10', iconColor: 'text-[#3D8A80]' },
            { label: 'Pending', value: stats.pending_orders, icon: Clock, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600' },
            { label: "Today's Orders", value: stats.today_orders, icon: CheckCircle, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
            { label: "Today's Revenue", value: `₱${stats.today_revenue.toLocaleString()}`, icon: DollarSign, iconBg: 'bg-[#7BBFB5]/10', iconColor: 'text-[#3D8A80]' },
          ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
            <div
              key={label}
              className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-nunito text-xs font-medium text-stone-500 uppercase tracking-wide">{label}</p>
                  <p className="font-playfair text-2xl font-semibold text-stone-900 mt-1">{value}</p>
                </div>
                <div className={`p-3 ${iconBg} rounded-lg`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters bar */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block font-nunito text-xs font-medium text-stone-600 mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Order #, name, contact…"
                  className="
                    w-full pl-10 pr-4 py-2 font-nunito text-sm text-stone-900
                    bg-[#FAFAF8] border border-[#E8E3DA] rounded-[10px]
                    placeholder:text-stone-400
                    focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                    transition-colors
                  "
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block font-nunito text-xs font-medium text-stone-600 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
                className="
                  w-full px-3 py-2 font-nunito text-sm text-stone-900
                  bg-[#FAFAF8] border border-[#E8E3DA] rounded-[10px]
                  focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                  transition-colors
                "
              >
                <option value="all">All Statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{formatStatusLabel(s)}</option>
                ))}
              </select>
            </div>

            {/* Service Type */}
            <div>
              <label className="block font-nunito text-xs font-medium text-stone-600 mb-1.5">Service Type</label>
              <select
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value as 'all' | 'dine-in' | 'pickup' | 'delivery')}
                className="
                  w-full px-3 py-2 font-nunito text-sm text-stone-900
                  bg-[#FAFAF8] border border-[#E8E3DA] rounded-[10px]
                  focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                  transition-colors
                "
              >
                <option value="all">All Types</option>
                <option value="dine-in">Dine In</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="block font-nunito text-xs font-medium text-stone-600 mb-1.5">Date Range</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
                className="
                  w-full px-3 py-2 font-nunito text-sm text-stone-900
                  bg-[#FAFAF8] border border-[#E8E3DA] rounded-[10px]
                  focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                  transition-colors
                "
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* Branch filter — only shown when multiple branches exist */}
          {branches.length > 1 && (
            <div className="mt-4 pt-4 border-t border-[#E8E3DA]">
              <label className="block font-nunito text-xs font-medium text-stone-600 mb-1.5">Branch</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setBranchFilter('all')}
                  className={`px-3 py-1.5 rounded-full font-nunito text-xs font-medium border transition-colors duration-200 ${
                    branchFilter === 'all'
                      ? 'bg-[#7BBFB5] text-[#F0EBE0] border-[#7BBFB5]'
                      : 'bg-white text-stone-600 border-[#E8E3DA] hover:border-[#7BBFB5] hover:text-[#3D8A80]'
                  }`}
                >
                  All Branches
                </button>
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => setBranchFilter(branch.id)}
                    className={`px-3 py-1.5 rounded-full font-nunito text-xs font-medium border transition-colors duration-200 ${
                      branchFilter === branch.id
                        ? 'bg-[#7BBFB5] text-[#F0EBE0] border-[#7BBFB5]'
                        : 'bg-white text-stone-600 border-[#E8E3DA] hover:border-[#7BBFB5] hover:text-[#3D8A80]'
                    }`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bulk actions bar */}
        {selectedOrders.length > 0 && (
          <div className="bg-[#7BBFB5]/10 border border-[#7BBFB5]/30 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-nunito text-sm font-semibold text-stone-900">Bulk Actions</h3>
                <p className="font-nunito text-xs text-stone-500 mt-0.5">
                  {selectedOrders.length} order{selectedOrders.length !== 1 ? 's' : ''} selected
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      void handleBulkStatusChange(e.target.value as OrderStatus);
                      e.target.value = '';
                    }
                  }}
                  disabled={isProcessing}
                  className="
                    px-3 py-2 font-nunito text-sm text-stone-900
                    bg-white border border-[#E8E3DA] rounded-[10px]
                    focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                    disabled:opacity-50
                  "
                >
                  <option value="">Change Status…</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{formatStatusLabel(s)}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSelectedOrders([])}
                  className="
                    px-4 py-2 font-nunito text-sm font-medium text-stone-600
                    bg-white border border-[#E8E3DA] rounded-[10px]
                    hover:bg-[#F2EEE8] transition-colors duration-200
                  "
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Orders table */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#E8E3DA] border-t-[#7BBFB5] mx-auto mb-4" />
              <p className="font-nunito text-sm text-stone-500">Loading orders…</p>
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="h-16 w-16 text-stone-300 mx-auto mb-4" />
              <p className="font-nunito text-base font-medium text-stone-600 mb-1">No orders found</p>
              <p className="font-nunito text-sm text-stone-400">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F2EEE8] border-b border-[#E8E3DA]">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <button onClick={handleSelectAll} className="flex items-center" title="Select all">
                          {selectedOrders.length === displayedOrders.length && displayedOrders.length > 0 ? (
                            <CheckSquare className="h-4 w-4 text-[#3D8A80]" />
                          ) : (
                            <Square className="h-4 w-4 text-stone-400" />
                          )}
                        </button>
                      </th>
                      {['Order #', 'Customer', 'Service', 'Total', 'Status', 'Delivery', 'Date', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-nunito text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DA]">
                    {displayedOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#FAFAF8] transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button onClick={() => handleSelectOrder(order.id)} className="focus:outline-none">
                            {selectedOrders.includes(order.id) ? (
                              <CheckSquare className="h-4 w-4 text-[#3D8A80]" />
                            ) : (
                              <Square className="h-4 w-4 text-stone-400 hover:text-stone-600" />
                            )}
                          </button>
                        </td>

                        {/* Order # */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-nunito font-semibold text-stone-900">{order.order_number}</div>
                          {order.msession && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-nunito text-xs bg-blue-100 text-blue-800 mt-1">
                              Messenger
                            </span>
                          )}
                        </td>

                        {/* Customer */}
                        <td className="px-4 py-3">
                          <div className="font-nunito font-medium text-stone-900">{order.customer_name}</div>
                          <div className="font-nunito text-xs text-stone-500 mt-0.5">{order.contact_number}</div>
                          {order.messenger_name && (
                            <div className="font-nunito text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span>💬</span>
                              <span>{order.messenger_name}</span>
                            </div>
                          )}
                          <div className="mt-1">
                            <CustomerLinkWidget order={order} onUpdate={() => fetchOrders(filters)} />
                          </div>
                        </td>

                        {/* Service */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-1 rounded-md font-nunito text-xs font-medium bg-[#F2EEE8] text-stone-700 capitalize">
                            {order.service_type.replace('-', ' ')}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-nunito text-sm font-semibold text-stone-900">₱{order.total.toLocaleString()}</div>
                        </td>

                        {/* Status select */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                            disabled={isProcessing}
                            className={`px-2 py-1 rounded-md font-nunito text-xs font-medium border cursor-pointer ${getStatusColor(order.status)} focus:ring-2 focus:ring-[#7BBFB5]/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>{formatStatusLabel(s)}</option>
                            ))}
                          </select>
                        </td>

                        {/* Delivery info */}
                        <td className="px-4 py-3">
                          {order.service_type === 'delivery' ? (
                            <div className="space-y-1 min-w-[100px]">
                              {order.delivery_fee != null && (
                                <div className="font-nunito text-xs text-stone-600">
                                  ₱{order.delivery_fee.toLocaleString()}
                                </div>
                              )}
                              {order.lalamove_order_id && (
                                <div className="flex items-center gap-1">
                                  <Activity className="h-3 w-3 text-blue-500" />
                                  <span className="font-nunito text-xs text-blue-600 font-medium truncate">
                                    {order.lalamove_status || 'Active'}
                                  </span>
                                </div>
                              )}
                              {order.lalamove_tracking_url && (
                                <a
                                  href={order.lalamove_tracking_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-nunito text-xs text-[#3D8A80] hover:text-[#2C6E65] font-medium"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Track
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="font-nunito text-xs text-stone-400">—</span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-nunito text-xs text-stone-500">{formatDate(order.created_at)}</div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="font-nunito text-sm font-medium text-[#3D8A80] hover:text-[#2C6E65] transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="lg:hidden divide-y divide-[#E8E3DA]">
                {displayedOrders.map((order) => (
                  <div key={order.id} className="p-4 hover:bg-[#FAFAF8] transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <button onClick={() => handleSelectOrder(order.id)} className="mt-1 focus:outline-none">
                          {selectedOrders.includes(order.id) ? (
                            <CheckSquare className="h-5 w-5 text-[#3D8A80]" />
                          ) : (
                            <Square className="h-5 w-5 text-stone-400" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-nunito font-semibold text-stone-900">{order.order_number}</span>
                            {order.msession && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full font-nunito text-xs bg-blue-100 text-blue-800">
                                Messenger
                              </span>
                            )}
                          </div>
                          <div className="font-nunito text-sm text-stone-700 mb-0.5">{order.customer_name}</div>
                          <div className="font-nunito text-xs text-stone-500">{order.contact_number}</div>
                          {order.messenger_name && (
                            <div className="font-nunito text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span>💬</span>
                              <span>{order.messenger_name}</span>
                            </div>
                          )}
                          <div className="mt-1">
                            <CustomerLinkWidget order={order} onUpdate={() => fetchOrders(filters)} />
                          </div>
                        </div>
                      </div>
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        disabled={isProcessing}
                        className={`ml-2 px-2 py-1 rounded-md font-nunito text-xs font-medium border ${getStatusColor(order.status)} focus:ring-2 focus:ring-[#7BBFB5]/40 focus:outline-none disabled:opacity-50`}
                      >
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>{formatStatusLabel(s)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-3 pl-8">
                      <div>
                        <span className="font-nunito text-xs text-stone-500 block mb-0.5">Service</span>
                        <span className="font-nunito text-stone-900 font-medium capitalize">
                          {order.service_type.replace('-', ' ')}
                        </span>
                      </div>
                      <div>
                        <span className="font-nunito text-xs text-stone-500 block mb-0.5">Total</span>
                        <span className="font-nunito text-stone-900 font-semibold">₱{order.total.toLocaleString()}</span>
                      </div>
                      {order.service_type === 'delivery' && order.delivery_fee != null && (
                        <div>
                          <span className="font-nunito text-xs text-stone-500 block mb-0.5">Delivery Fee</span>
                          <span className="font-nunito text-stone-900">₱{order.delivery_fee.toLocaleString()}</span>
                        </div>
                      )}
                      {order.service_type === 'delivery' && order.lalamove_tracking_url && (
                        <div>
                          <span className="font-nunito text-xs text-stone-500 block mb-0.5">Tracking</span>
                          <a
                            href={order.lalamove_tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-nunito text-[#3D8A80] hover:text-[#2C6E65] font-medium"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="text-xs">Track</span>
                          </a>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="font-nunito text-xs text-stone-500 block mb-0.5">Date</span>
                        <span className="font-nunito text-stone-900 text-xs">{formatDate(order.created_at)}</span>
                      </div>
                    </div>

                    <div className="pl-8">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="font-nunito text-sm font-medium text-[#3D8A80] hover:text-[#2C6E65] transition-colors"
                      >
                        View Full Details →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedOrder(null); }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b border-[#E8E3DA] px-4 sm:px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-playfair text-xl font-semibold text-stone-900">Order Details</h2>
                <p className="font-nunito text-sm text-stone-500 mt-0.5">{selectedOrder.order_number}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1"
                aria-label="Close"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6">
              {/* Customer info */}
              <div className="bg-[#F2EEE8] rounded-xl p-4">
                <h3 className="font-nunito text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Customer Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="font-nunito text-xs text-stone-500 mb-1">Customer Name</p>
                    <p className="font-nunito text-base font-medium text-stone-900">{selectedOrder.customer_name}</p>
                  </div>
                  <div>
                    <p className="font-nunito text-xs text-stone-500 mb-1">Contact Number</p>
                    <p className="font-nunito text-base font-medium text-stone-900">{selectedOrder.contact_number}</p>
                  </div>
                  <div>
                    <p className="font-nunito text-xs text-stone-500 mb-1">Service Type</p>
                    <span className="inline-flex items-center px-2 py-1 rounded-md font-nunito text-sm font-medium bg-[#E8E3DA] text-stone-700 capitalize">
                      {selectedOrder.service_type.replace('-', ' ')}
                    </span>
                  </div>
                  <div>
                    <p className="font-nunito text-xs text-stone-500 mb-1">Payment Method</p>
                    <p className="font-nunito text-base font-medium text-stone-900 capitalize">{selectedOrder.payment_method}</p>
                  </div>
                  {selectedOrder.customer_id && (
                    <div className="col-span-2">
                      <p className="font-nunito text-xs text-stone-500 mb-1">Linked Customer</p>
                      <CustomerLinkWidget order={selectedOrder} onUpdate={() => fetchOrders(filters)} />
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery / Pickup info */}
              {(selectedOrder.address || selectedOrder.pickup_time || selectedOrder.party_size) && (
                <div className="bg-[#F2EEE8] rounded-xl p-4">
                  <h3 className="font-nunito text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
                    {selectedOrder.service_type === 'delivery'
                      ? 'Delivery'
                      : selectedOrder.service_type === 'pickup'
                      ? 'Pickup'
                      : 'Dine-in'}{' '}
                    Information
                  </h3>
                  {selectedOrder.address && (
                    <div className="mb-3">
                      <p className="font-nunito text-xs text-stone-500 mb-1">Address</p>
                      <p className="font-nunito text-base text-stone-900">{selectedOrder.address}</p>
                      {selectedOrder.landmark && (
                        <p className="font-nunito text-sm text-stone-600 mt-1">
                          <span className="font-medium">Landmark:</span> {selectedOrder.landmark}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedOrder.pickup_time && (
                    <div className="mb-3">
                      <p className="font-nunito text-xs text-stone-500 mb-1">Pickup Time</p>
                      <p className="font-nunito text-base text-stone-900">{selectedOrder.pickup_time}</p>
                    </div>
                  )}
                  {selectedOrder.party_size && (
                    <div className="mb-3">
                      <p className="font-nunito text-xs text-stone-500 mb-1">Party Size</p>
                      <p className="font-nunito text-base text-stone-900">
                        {selectedOrder.party_size} person{selectedOrder.party_size !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                  {selectedOrder.dine_in_time && (
                    <div>
                      <p className="font-nunito text-xs text-stone-500 mb-1">Preferred Time</p>
                      <p className="font-nunito text-base text-stone-900">{formatDate(selectedOrder.dine_in_time)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Lalamove delivery details */}
              {selectedOrder.service_type === 'delivery' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-5 w-5 text-blue-600" />
                    <h3 className="font-playfair text-lg font-semibold text-blue-900">Lalamove Delivery Details</h3>
                  </div>

                  {selectedOrder.delivery_fee != null && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-stone-500" />
                        <span className="font-nunito text-sm font-medium text-stone-700">Delivery Fee</span>
                      </div>
                      <span className="font-nunito text-lg font-semibold text-stone-900">₱{selectedOrder.delivery_fee.toLocaleString()}</span>
                    </div>
                  )}

                  {selectedOrder.lalamove_quotation_id && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-stone-500" />
                        <span className="font-nunito text-sm font-medium text-stone-700">Quotation ID</span>
                      </div>
                      <p className="font-mono text-sm text-stone-900 bg-white px-3 py-2 rounded-lg border border-blue-200">
                        {selectedOrder.lalamove_quotation_id}
                      </p>
                    </div>
                  )}

                  {selectedOrder.lalamove_order_id && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-stone-500" />
                        <span className="font-nunito text-sm font-medium text-stone-700">Order ID</span>
                      </div>
                      <p className="font-mono text-sm text-stone-900 bg-white px-3 py-2 rounded-lg border border-blue-200">
                        {selectedOrder.lalamove_order_id}
                      </p>
                    </div>
                  )}

                  {selectedOrder.lalamove_status && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-4 w-4 text-stone-500" />
                        <span className="font-nunito text-sm font-medium text-stone-700">Delivery Status</span>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full font-nunito text-xs font-medium ${
                          selectedOrder.lalamove_status.toLowerCase().includes('assigned') ||
                          selectedOrder.lalamove_status.toLowerCase().includes('picked') ||
                          selectedOrder.lalamove_status.toLowerCase().includes('delivered')
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : selectedOrder.lalamove_status.toLowerCase().includes('cancelled') ||
                              selectedOrder.lalamove_status.toLowerCase().includes('failed')
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {selectedOrder.lalamove_status}
                      </span>
                    </div>
                  )}

                  {selectedOrder.lalamove_tracking_url && (
                    <div>
                      <a
                        href={selectedOrder.lalamove_tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                          inline-flex items-center gap-2 px-4 py-2
                          bg-[#7BBFB5] text-[#F0EBE0] font-nunito text-sm font-medium
                          rounded-[10px] hover:bg-[#3D8A80] active:bg-[#2C6E65]
                          transition-colors duration-200
                        "
                      >
                        <ExternalLink className="h-4 w-4" />
                        Track Delivery
                      </a>
                    </div>
                  )}

                  {!selectedOrder.lalamove_order_id && !selectedOrder.lalamove_quotation_id && (
                    <p className="font-nunito text-sm text-stone-500 italic">
                      No Lalamove delivery information available yet.
                    </p>
                  )}
                </div>
              )}

              {/* Order items */}
              <div>
                <h3 className="font-nunito text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Order Items</h3>
                <div className="space-y-3">
                  {selectedOrder.order_items?.map((item) => (
                    <div key={item.id} className="flex items-start justify-between p-4 bg-[#F2EEE8] rounded-xl border border-[#E8E3DA]">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-nunito font-semibold text-stone-900">{item.menu_item_name}</p>
                          {item.bundle_id && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold font-nunito bg-[#7BBFB5]/20 text-[#4A9B91] border border-[#7BBFB5]/40">
                              Bundle
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {/* Bundle slot selections */}
                          {item.bundle_selections && item.bundle_selections.length > 0 ? (
                            <div className="mt-2 space-y-2 pl-1 border-l-2 border-[#7BBFB5]/40">
                              {item.bundle_selections.map((sel, idx) => (
                                <div key={idx} className="pl-2">
                                  <p className="font-nunito text-sm text-stone-700">
                                    <span className="text-stone-500">{sel.slot_label}:</span>{' '}
                                    <span className="font-medium">{sel.item_name}</span>
                                    {sel.variation && (
                                      <span className="text-stone-500">
                                        {' '}({sel.variation.name}{sel.variation.price > 0 ? ` +₱${sel.variation.price.toLocaleString()}` : ''})
                                      </span>
                                    )}
                                  </p>
                                  {sel.add_ons && sel.add_ons.length > 0 && (
                                    <div className="pl-2 mt-0.5 space-y-0.5">
                                      {sel.add_ons.map((ao, aoIdx) => (
                                        <p key={aoIdx} className="font-nunito text-xs text-[#4A9B91]">
                                          + {ao.name}{ao.price > 0 ? ` ₱${ao.price.toLocaleString()}` : ''}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              {item.selected_variation && (
                                <p className="font-nunito text-sm text-stone-600">
                                  <span className="font-medium">Variation:</span> {item.selected_variation.name}
                                </p>
                              )}
                              {item.selected_add_ons && item.selected_add_ons.length > 0 && (
                                <p className="font-nunito text-sm text-stone-600">
                                  <span className="font-medium">Add-ons:</span>{' '}
                                  {item.selected_add_ons.map((a) => a.name).join(', ')}
                                </p>
                              )}
                            </>
                          )}
                          <p className="font-nunito text-xs text-stone-500 mt-1">
                            Qty: {item.quantity} × ₱{item.unit_price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <p className="font-nunito text-base font-bold text-stone-900">₱{item.total_price.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order summary */}
              <div className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] flex items-center justify-between">
                <span className="font-nunito text-base font-semibold text-stone-700">Order Total</span>
                <span className="font-playfair text-2xl font-bold text-stone-900">₱{selectedOrder.total.toLocaleString()}</span>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="font-nunito text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Special Notes</h3>
                  <p className="font-nunito text-sm text-stone-900">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Status & timestamps */}
              <div className="border-t border-[#E8E3DA] pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-nunito text-xs text-stone-500 mb-2">Order Status</p>
                    <select
                      value={selectedOrder.status}
                      onChange={(e) => {
                        void handleStatusChange(selectedOrder.id, e.target.value as OrderStatus);
                        setSelectedOrder({ ...selectedOrder, status: e.target.value as OrderStatus });
                      }}
                      disabled={isProcessing}
                      className={`px-4 py-2 rounded-lg font-nunito text-sm font-medium border ${getStatusColor(selectedOrder.status)} focus:ring-2 focus:ring-[#7BBFB5]/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>{formatStatusLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-right">
                    <p className="font-nunito text-xs text-stone-500 mb-1">Order Created</p>
                    <p className="font-nunito text-sm font-medium text-stone-900">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
