'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Clock, Package, Truck, CheckSquare, Square, ExternalLink, DollarSign, Activity, RefreshCw } from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { Order, OrderStatus, OrderFilters } from '../types';
import CustomerLinkWidget from './CustomerLinkWidget';

interface OrderManagerProps {
  onBack: () => void;
}

const OrderManager: React.FC<OrderManagerProps> = ({ onBack }) => {
  const { orders, loading, fetchOrders, updateOrderStatus, bulkUpdateStatus, getOrderStats } = useOrders({ admin: true });
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [filters, setFilters] = useState<OrderFilters>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'all' | 'dine-in' | 'pickup' | 'delivery'>('all');
  const [stats, setStats] = useState({
    total_orders: 0,
    pending_orders: 0,
    today_orders: 0,
    today_revenue: 0,
    completed_orders: 0,
    cancelled_orders: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isRealTimeActive, setIsRealTimeActive] = useState(true);
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

  // Apply filters when filter values change (not when functions change)
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
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        newFilters.date_from = weekAgo.toISOString();
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        newFilters.date_from = monthAgo.toISOString();
      }

      setFilters(newFilters);
      await fetchOrders(newFilters);
    };

    // Only apply filters if not initial mount, or if filters actually changed
    if (!isInitialMount.current) {
      void applyFilters();
    } else {
      isInitialMount.current = false;
      void applyFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, serviceTypeFilter, searchTerm, dateFilter]); // fetchOrders is stable, no need to include

  // Load stats on mount and set up interval
  useEffect(() => {
    void loadStats();

    const statsInterval = setInterval(() => {
      if (isRealTimeActive) {
        void loadStats();
      }
    }, 10000); // Refresh stats every 10 seconds

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
        // Don't wait for stats to load - update in background
        loadStats().catch(err => console.error('Error loading stats:', err));
        alert(`Successfully updated ${selectedOrders.length} order(s)`);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to update orders');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(order => order.id));
    }
  };

  const getStatusColor = (status: OrderStatus): string => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
      preparing: 'bg-orange-100 text-orange-800 border-orange-200',
      ready: 'bg-green-100 text-green-800 border-green-200',
      out_for_delivery: 'bg-purple-100 text-purple-800 border-purple-200',
      completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusOptions: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Dashboard</span>
              </button>
              <h1 className="text-2xl font-playfair font-semibold text-black">Order Management</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header Actions */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Orders Overview</h2>
            <p className="text-sm text-gray-500 mt-1">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'} found
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <div className={`h-2 w-2 rounded-full ${isRealTimeActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-green-700 font-medium">
                {isRealTimeActive ? 'Live' : 'Paused'}
              </span>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total_orders}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pending_orders}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Today's Orders</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.today_orders}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Today's Revenue</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">₱{stats.today_revenue.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-emerald-100 rounded-lg">
                <Truck className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Order #, Name, Contact..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Service Type</label>
              <select
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value as 'all' | 'dine-in' | 'pickup' | 'delivery')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="dine-in">Dine In</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedOrders.length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Bulk Actions</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedOrders.length} order{selectedOrders.length !== 1 ? 's' : ''} selected</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value as OrderStatus);
                      e.target.value = '';
                    }
                  }}
                  className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  disabled={isProcessing}
                >
                  <option value="">Change Status...</option>
                  {statusOptions.map(status => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setSelectedOrders([])}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Orders List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-blue-600 mx-auto mb-4"></div>
              <p className="text-sm text-gray-500">Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-base font-medium text-gray-600 mb-1">No orders found</p>
              <p className="text-sm text-gray-500">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        <button
                          onClick={handleSelectAll}
                          className="flex items-center"
                          title="Select all"
                        >
                          {selectedOrders.length === orders.length && orders.length > 0 ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Order #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Service</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Delivery</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button 
                            onClick={() => handleSelectOrder(order.id)}
                            className="focus:outline-none"
                          >
                            {selectedOrders.includes(order.id) ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-gray-900">{order.order_number}</div>
                          {order.msession && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 mt-1">
                              Messenger
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-gray-900">{order.customer_name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{order.contact_number}</div>
                            {order.messenger_name && (
                              <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                <span>💬</span>
                                <span>{order.messenger_name}</span>
                                {order.messenger_psid && (
                                  <span className="text-gray-400 text-[10px]">({order.messenger_psid})</span>
                                )}
                              </div>
                            )}
                            <div className="mt-1">
                              <CustomerLinkWidget order={order} onUpdate={() => fetchOrders(filters)} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                            {order.service_type.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">₱{order.total.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                            disabled={isProcessing}
                            className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer ${getStatusColor(order.status)} focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {statusOptions.map(status => (
                              <option key={status} value={status}>
                                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {order.service_type === 'delivery' ? (
                            <div className="space-y-1 min-w-[100px]">
                              {order.delivery_fee !== null && (
                                <div className="text-xs text-gray-600">
                                  ₱{order.delivery_fee.toLocaleString()}
                                </div>
                              )}
                              {order.lalamove_order_id && (
                                <div className="flex items-center gap-1">
                                  <Activity className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs text-blue-600 font-medium truncate">
                                    {order.lalamove_status || 'Active'}
                                  </span>
                                </div>
                              )}
                              {order.lalamove_tracking_url && (
                                <a
                                  href={order.lalamove_tracking_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span>Track</span>
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{formatDate(order.created_at)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile/Tablet Card View */}
              <div className="lg:hidden">
                {orders.map((order) => (
                  <div key={order.id} className="p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <button 
                          onClick={() => handleSelectOrder(order.id)}
                          className="mt-1 focus:outline-none"
                        >
                          {selectedOrders.includes(order.id) ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900">{order.order_number}</span>
                            {order.msession && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                                Messenger
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mb-1">{order.customer_name}</div>
                          <div className="text-xs text-gray-500">{order.contact_number}</div>
                          {order.messenger_name && (
                            <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span>💬</span>
                              <span>{order.messenger_name}</span>
                              {order.messenger_psid && (
                                <span className="text-gray-400 text-[10px]">({order.messenger_psid})</span>
                              )}
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
                        className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(order.status)} focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50`}
                      >
                        {statusOptions.map(status => (
                          <option key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3 pl-8">
                      <div>
                        <span className="text-xs text-gray-500 block mb-0.5">Service</span>
                        <span className="text-gray-900 font-medium capitalize">{order.service_type.replace('-', ' ')}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block mb-0.5">Total</span>
                        <span className="text-gray-900 font-semibold">₱{order.total.toLocaleString()}</span>
                      </div>
                      {order.service_type === 'delivery' && order.delivery_fee !== null && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-0.5">Delivery Fee</span>
                          <span className="text-gray-900">₱{order.delivery_fee.toLocaleString()}</span>
                        </div>
                      )}
                      {order.service_type === 'delivery' && order.lalamove_tracking_url && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-0.5">Tracking</span>
                          <a
                            href={order.lalamove_tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="text-xs">Track</span>
                          </a>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-xs text-gray-500 block mb-0.5">Date</span>
                        <span className="text-gray-900 text-xs">{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                    <div className="pl-8">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
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

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Order Details</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selectedOrder.order_number}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                aria-label="Close"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6">
              {/* Customer Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Customer Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Customer Name</p>
                    <p className="text-base font-medium text-gray-900">{selectedOrder.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Contact Number</p>
                    <p className="text-base font-medium text-gray-900">{selectedOrder.contact_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Service Type</p>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-sm font-medium bg-gray-200 text-gray-800 capitalize">
                      {selectedOrder.service_type.replace('-', ' ')}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Payment Method</p>
                    <p className="text-base font-medium text-gray-900 capitalize">{selectedOrder.payment_method}</p>
                  </div>
                </div>
              </div>
              {/* Delivery/Pickup Information */}
              {(selectedOrder.address || selectedOrder.pickup_time || selectedOrder.party_size) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    {selectedOrder.service_type === 'delivery' ? 'Delivery' : selectedOrder.service_type === 'pickup' ? 'Pickup' : 'Dine-in'} Information
                  </h3>
                  {selectedOrder.address && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Address</p>
                      <p className="text-base text-gray-900">{selectedOrder.address}</p>
                      {selectedOrder.landmark && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">Landmark:</span> {selectedOrder.landmark}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedOrder.pickup_time && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Pickup Time</p>
                      <p className="text-base text-gray-900">{selectedOrder.pickup_time}</p>
                    </div>
                  )}
                  {selectedOrder.party_size && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Party Size</p>
                      <p className="text-base text-gray-900">{selectedOrder.party_size} person{selectedOrder.party_size !== 1 ? 's' : ''}</p>
                    </div>
                  )}
                  {selectedOrder.dine_in_time && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Preferred Time</p>
                      <p className="text-base text-gray-900">{formatDate(selectedOrder.dine_in_time)}</p>
                    </div>
                  )}
                </div>
              )}
              {selectedOrder.service_type === 'delivery' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <Truck className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-blue-900">Lalamove Delivery Details</h3>
                  </div>
                  
                  {selectedOrder.delivery_fee !== null && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Delivery Fee</span>
                      </div>
                      <span className="text-lg font-semibold text-black">₱{selectedOrder.delivery_fee.toLocaleString()}</span>
                    </div>
                  )}

                  {selectedOrder.lalamove_quotation_id && (
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Package className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Quotation ID</span>
                      </div>
                      <p className="text-sm text-gray-900 font-mono bg-white px-3 py-2 rounded border">{selectedOrder.lalamove_quotation_id}</p>
                    </div>
                  )}

                  {selectedOrder.lalamove_order_id && (
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Package className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Order ID</span>
                      </div>
                      <p className="text-sm text-gray-900 font-mono bg-white px-3 py-2 rounded border">{selectedOrder.lalamove_order_id}</p>
                    </div>
                  )}

                  {selectedOrder.lalamove_status && (
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Activity className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Delivery Status</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          selectedOrder.lalamove_status.toLowerCase().includes('assigned') || 
                          selectedOrder.lalamove_status.toLowerCase().includes('picked') ||
                          selectedOrder.lalamove_status.toLowerCase().includes('delivered')
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : selectedOrder.lalamove_status.toLowerCase().includes('cancelled') || 
                              selectedOrder.lalamove_status.toLowerCase().includes('failed')
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {selectedOrder.lalamove_status}
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedOrder.lalamove_tracking_url && (
                    <div>
                      <a
                        href={selectedOrder.lalamove_tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="text-sm font-medium">Track Delivery</span>
                      </a>
                    </div>
                  )}

                  {!selectedOrder.lalamove_order_id && !selectedOrder.lalamove_quotation_id && (
                    <div className="text-sm text-gray-500 italic">
                      No Lalamove delivery information available yet.
                    </div>
                  )}
                </div>
              )}
              {/* Order Items */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Order Items</h3>
                <div className="space-y-3">
                  {selectedOrder.order_items?.map((item) => (
                    <div key={item.id} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 mb-1">{item.menu_item_name}</p>
                        <div className="space-y-1">
                          {item.selected_variation && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Variation:</span> {item.selected_variation.name}
                            </p>
                          )}
                          {item.selected_add_ons && item.selected_add_ons.length > 0 && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Add-ons:</span> {item.selected_add_ons.map(a => a.name).join(', ')}
                            </p>
                          )}
                          <p className="text-xs text-gray-500">
                            Quantity: {item.quantity} × ₱{item.unit_price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <p className="text-base font-bold text-gray-900">₱{item.total_price.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-700">Order Total</span>
                  <span className="text-2xl font-bold text-gray-900">₱{selectedOrder.total.toLocaleString()}</span>
                </div>
              </div>
              {/* Notes */}
              {selectedOrder.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Special Notes</h3>
                  <p className="text-sm text-gray-900">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Order Status & Actions */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-2">Order Status</p>
                    <select
                      value={selectedOrder.status}
                      onChange={(e) => {
                        handleStatusChange(selectedOrder.id, e.target.value as OrderStatus);
                        setSelectedOrder({ ...selectedOrder, status: e.target.value as OrderStatus });
                      }}
                      disabled={isProcessing}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border ${getStatusColor(selectedOrder.status)} focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {statusOptions.map(status => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Order Created</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManager;
