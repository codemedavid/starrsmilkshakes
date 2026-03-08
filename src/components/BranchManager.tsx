import { useState, useEffect } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
import type { Branch } from '@/types';
import { Plus, Edit2, Trash2, MapPin, Phone, Check, X } from 'lucide-react';
import LocationPicker from './LocationPicker';

export default function BranchManager() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: '',
        latitude: '',
        longitude: '',
        is_main: false,
        is_active: true,
        messenger_username: ''
    });

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const response = await adminFetch('/api/admin/branches');
            const data = await parseApiResponse<{ branches: Branch[] }>(response);
            setBranches(data.branches || []);
        } catch (error) {
            console.error('Error fetching branches:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingBranch) {
                const response = await adminFetch(`/api/admin/branches/${editingBranch.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(formData),
                });
                await parseApiResponse<{ branch: Branch }>(response);
            } else {
                const response = await adminFetch('/api/admin/branches', {
                    method: 'POST',
                    body: JSON.stringify(formData),
                });
                await parseApiResponse<{ branch: Branch }>(response);
            }

            await fetchBranches();
            resetForm();
        } catch (error) {
            console.error('Error saving branch:', error);
            alert('Failed to save branch');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this branch?')) return;

        try {
            const response = await adminFetch(`/api/admin/branches/${id}`, {
                method: 'DELETE',
            });
            await parseApiResponse<{ success: boolean }>(response);
            setBranches(branches.filter(b => b.id !== id));
        } catch (error) {
            console.error('Error deleting branch:', error);
            alert('Failed to delete branch');
        }
    };

    const startEdit = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            address: branch.address,
            phone: branch.phone,
            latitude: branch.latitude,
            longitude: branch.longitude,
            is_main: branch.is_main,
            is_active: branch.is_active,
            messenger_username: branch.messenger_username || ''
        });
        setIsAdding(true);
    };

    const resetForm = () => {
        setEditingBranch(null);
        setFormData({
            name: '',
            address: '',
            phone: '',
            latitude: '',
            longitude: '',
            is_main: false,
            is_active: true,
            messenger_username: ''
        });
        setIsAdding(false);
    };

    if (loading) return <div className="p-4">Loading branches...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Branch Management</h2>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Add Branch
                    </button>
                )}
            </div>

            {isAdding && (
                <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                                placeholder="e.g. Makati Branch"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                            <input
                                type="text"
                                required
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                                placeholder="+63 9XX XXX XXXX"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                            <input
                                type="text"
                                required
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                                placeholder="Full address for delivery pickup"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Location</label>
                            <LocationPicker
                                initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
                                initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
                                onLocationSelect={(lat, lng, address) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        latitude: lat.toString(),
                                        longitude: lng.toString(),
                                        address: address || prev.address // Use detected address if provided, otherwise keep existing
                                    }));
                                }}
                            />
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.latitude}
                                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 text-sm"
                                    placeholder="Latitude"
                                />
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.longitude}
                                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 text-sm"
                                    placeholder="Longitude"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Page Username (for Messenger)</label>
                            <div className="flex items-center">
                                <span className="text-gray-500 text-sm mr-2">m.me/</span>
                                <input
                                    type="text"
                                    value={formData.messenger_username}
                                    onChange={e => setFormData({ ...formData, messenger_username: e.target.value })}
                                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                                    placeholder="e.g. StarrsFamousShakesMakati"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Leave empty to use the default Facebook page</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_main}
                                onChange={e => setFormData({ ...formData, is_main: e.target.checked })}
                                className="w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
                            />
                            <span className="text-sm text-gray-700">Main Branch</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_active}
                                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                className="w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
                            />
                            <span className="text-sm text-gray-700">Active</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
                        >
                            {editingBranch ? 'Update Branch' : 'Create Branch'}
                        </button>
                    </div>
                </form>
            )}

            <div className="grid gap-4">
                {branches.map((branch) => (
                    <div key={branch.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                                {branch.is_main && (
                                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">Main</span>
                                )}
                                {!branch.is_active && (
                                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full font-medium">Inactive</span>
                                )}
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                    <MapPin className="w-4 h-4" /> {branch.address}
                                </p>
                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                    <Phone className="w-4 h-4" /> {branch.phone}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => startEdit(branch)}
                                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleDelete(branch.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}

                {branches.length === 0 && !isAdding && (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        No branches found. Add your first branch above.
                    </div>
                )}
            </div>
        </div>
    );
}
