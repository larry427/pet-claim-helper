import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type Profile = any;
type Pet = any;
type Claim = any;
type FoodEntry = any;

interface UserWithStats {
  profile: Profile;
  pets: Pet[];
  claims: Claim[];
  petsCount: number;
  claimsCount: number;
  totalClaimAmount: number;
  lastActive: string;
  status: 'active' | 'pet-only' | 'inactive';
}

interface ClaimWithDetails extends Claim {
  userEmail: string;
  userName: string;
  petName: string;
  insuranceCompany: string;
}

interface FoodEntryWithDetails extends FoodEntry {
  userEmail: string;
  petName: string;
  monthlyCost: number;
  daysLeft: number;
  status: 'Stocked' | 'Order Soon' | 'Urgent';
}

type SortColumn = 'email' | 'name' | 'petsCount' | 'claimsCount' | 'lastActive';
type SortDirection = 'asc' | 'desc';

const CUPS_PER_LB = {
  dry: 4,
  wet: 2,
  'freeze-dried': 9,
  raw: 2,
  cooked: 2.5
};

export default function AdminDashboard() {
  // Parse YYYY-MM-DD safely as a local Date (no timezone shift)
  const parseYmdLocal = (iso: string | null | undefined): Date | null => {
    if (!iso) return null
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const dt = new Date(y, mo, d)
    if (isNaN(dt.getTime())) return null
    return dt
  }

  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [allClaims, setAllClaims] = useState<ClaimWithDetails[]>([]);
  const [allFoodEntries, setAllFoodEntries] = useState<FoodEntryWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [insuranceFilter, setInsuranceFilter] = useState<string>('all');

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('email');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Expanded rows
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    try {
      setLoading(true);
      setError(null);

      // Load all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Filter out Larry's test accounts
      const realProfiles = profiles.filter(profile => {
        const email = (profile.email || '').toLowerCase();
        return !email.includes('larry') &&
               !email.includes('uglydogadventures') &&
               !email.includes('dogstrainedright');
      });

      // Get IDs of real users for filtering pets and claims
      const realUserIds = new Set(realProfiles.map(p => p.id));

      // Load all pets
      const { data: pets, error: petsError } = await supabase
        .from('pets')
        .select('*');

      if (petsError) throw petsError;

      // Filter pets to only those belonging to real users
      const realPets = pets.filter(pet => realUserIds.has(pet.user_id));

      // Load all claims
      const { data: claims, error: claimsError } = await supabase
        .from('claims')
        .select('*');

      if (claimsError) throw claimsError;

      // Filter claims to only those belonging to real users
      const realClaims = claims.filter(claim => realUserIds.has(claim.user_id));

      // Combine data (using filtered data only)
      const usersWithStats: UserWithStats[] = realProfiles.map(profile => {
        const userPets = realPets.filter(p => p.user_id === profile.id);
        const userClaims = realClaims.filter(c => c.user_id === profile.id);
        const totalAmount = userClaims.reduce((sum, c) => sum + (c.total_amount || 0), 0);

        let status: 'active' | 'pet-only' | 'inactive' = 'inactive';
        if (userClaims.length > 0) {
          status = 'active';
        } else if (userPets.length > 0) {
          status = 'pet-only';
        }

        return {
          profile,
          pets: userPets,
          claims: userClaims,
          petsCount: userPets.length,
          claimsCount: userClaims.length,
          totalClaimAmount: totalAmount,
          lastActive: profile.updated_at || profile.created_at,
          status
        };
      });

      // Create claims with details (using filtered data only)
      const claimsWithDetails: ClaimWithDetails[] = realClaims.map(claim => {
        const user = realProfiles.find(p => p.id === claim.user_id);
        const pet = realPets.find(p => p.id === claim.pet_id);

        return {
          ...claim,
          userEmail: user?.email || 'Unknown',
          userName: user?.full_name || 'Unknown',
          petName: pet?.name || 'Unknown',
          insuranceCompany: pet?.insurance_company || 'Unknown'
        };
      });

      // Load all food entries with joined pet and profile data
      const { data: foodEntriesWithJoin, error: foodError } = await supabase
        .from('food_entries')
        .select(`
          *,
          pets!inner (
            id,
            name,
            user_id,
            profiles!inner (
              id,
              email
            )
          )
        `);

      if (foodError) throw foodError;

      // Filter out Larry accounts client-side (in case database-level filtering doesn't work on nested joins)
      const filteredFoodEntries = (foodEntriesWithJoin || []).filter(entry => {
        const email = (entry.pets?.profiles?.email || '').toLowerCase();
        return !email.includes('larry') &&
               !email.includes('uglydogadventures') &&
               !email.includes('dogstrainedright');
      });

      // Create food entries with details
      const today = new Date();
      const foodEntriesWithDetails: FoodEntryWithDetails[] = filteredFoodEntries.map(entry => {
        // Data is already joined, no need to find pet/user
        const petName = entry.pets?.name || 'Unknown';
        const userEmail = entry.pets?.profiles?.email || 'Unknown';

        // Calculate metrics
        const cupsPerLb = CUPS_PER_LB[entry.food_type as keyof typeof CUPS_PER_LB] || 4;
        const totalCups = entry.bag_size_lbs * cupsPerLb;
        const daysPerBag = totalCups / entry.cups_per_day;
        const costPerDay = entry.bag_cost / daysPerBag;
        const monthlyCost = costPerDay * 30;

        // Calculate days left
        const startDate = new Date(entry.start_date);
        const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.max(0, Math.floor(daysPerBag - daysSinceStart));

        // Determine status
        let status: 'Stocked' | 'Order Soon' | 'Urgent' = 'Stocked';
        if (daysLeft < 3) status = 'Urgent';
        else if (daysLeft < 7) status = 'Order Soon';

        return {
          ...entry,
          userEmail,
          petName,
          monthlyCost,
          daysLeft,
          status
        };
      });

      setUsers(usersWithStats);
      setAllClaims(claimsWithDetails);
      setAllFoodEntries(foodEntriesWithDetails);
    } catch (err: any) {
      console.error('Error loading admin data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Calculate metrics
  const metrics = useMemo(() => {
    const activeUsers = users.filter(u => u.status === 'active').length;
    const inactiveUsers = users.filter(u => u.status === 'inactive').length;
    const totalPets = users.reduce((sum, u) => sum + u.petsCount, 0);
    const totalClaims = allClaims.length;
    const totalAmount = allClaims.reduce((sum, c) => sum + (c.total_amount || 0), 0);

    const draftClaims = allClaims.filter(c => c.filing_status === 'draft').length;
    const submittedClaims = allClaims.filter(c => c.filing_status === 'submitted').length;
    const paidClaims = allClaims.filter(c => c.filing_status === 'paid').length;

    const insuranceBreakdown: Record<string, number> = {};
    allClaims.forEach(claim => {
      const company = claim.insuranceCompany || 'Unknown';
      insuranceBreakdown[company] = (insuranceBreakdown[company] || 0) + 1;
    });

    // Food tracking metrics
    const totalFoodEntries = allFoodEntries.length;
    const usersTrackingFood = new Set(allFoodEntries.map(e => e.userEmail)).size;
    const totalMonthlyFoodSpend = allFoodEntries.reduce((sum, e) => sum + e.monthlyCost, 0);

    return {
      totalUsers: users.length,
      activeUsers,
      inactiveUsers,
      totalPets,
      totalClaims,
      totalAmount,
      draftClaims,
      submittedClaims,
      paidClaims,
      insuranceBreakdown,
      totalFoodEntries,
      usersTrackingFood,
      totalMonthlyFoodSpend
    };
  }, [users, allClaims, allFoodEntries]);

  // Sorting function
  const sortedUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortColumn) {
        case 'email':
          aVal = a.profile.email;
          bVal = b.profile.email;
          break;
        case 'name':
          aVal = a.profile.full_name || '';
          bVal = b.profile.full_name || '';
          break;
        case 'petsCount':
          aVal = a.petsCount;
          bVal = b.petsCount;
          break;
        case 'claimsCount':
          aVal = a.claimsCount;
          bVal = b.claimsCount;
          break;
        case 'lastActive':
          aVal = new Date(a.lastActive).getTime();
          bVal = new Date(b.lastActive).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [users, sortColumn, sortDirection]);

  // Filter claims
  const filteredClaims = useMemo(() => {
    return allClaims.filter(claim => {
      if (statusFilter !== 'all' && claim.filing_status !== statusFilter) return false;
      if (insuranceFilter !== 'all' && claim.insuranceCompany !== insuranceFilter) return false;
      return true;
    });
  }, [allClaims, statusFilter, insuranceFilter]);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function getStatusBadgeColor(status: string) {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pet-only':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getFilingStatusBadge(status: string) {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'draft':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">Error loading admin data</h2>
          <p className="text-red-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">System overview and user management</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total Users</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.totalUsers}</p>
          <div className="mt-2 text-sm">
            <span className="text-green-600">Active: {metrics.activeUsers}</span>
            <span className="text-gray-400 mx-2">•</span>
            <span className="text-red-600">Inactive: {metrics.inactiveUsers}</span>
          </div>
        </div>

        {/* Pets */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total Pets</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.totalPets}</p>
          <p className="text-sm text-gray-600 mt-2">Across all users</p>
        </div>

        {/* Claims */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total Claims</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.totalClaims}</p>
          <div className="mt-2 text-sm">
            <span className="text-gray-600">Draft: {metrics.draftClaims}</span>
            <span className="text-gray-400 mx-2">•</span>
            <span className="text-blue-600">Submitted: {metrics.submittedClaims}</span>
            <span className="text-gray-400 mx-2">•</span>
            <span className="text-green-600">Paid: {metrics.paidClaims}</span>
          </div>
        </div>

        {/* Total Amount */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total Amount</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            ${metrics.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-600 mt-2">All claims combined</p>
        </div>
      </div>

      {/* Food Tracking Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Total Food Entries */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow p-6 border border-emerald-200">
          <h3 className="text-sm font-medium text-emerald-700 uppercase">🍖 Food Entries</h3>
          <p className="text-3xl font-bold text-emerald-900 mt-2">{metrics.totalFoodEntries}</p>
          <p className="text-sm text-emerald-600 mt-2">Total tracked foods</p>
        </div>

        {/* Users Tracking Food */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow p-6 border border-emerald-200">
          <h3 className="text-sm font-medium text-emerald-700 uppercase">👥 Users Tracking Food</h3>
          <p className="text-3xl font-bold text-emerald-900 mt-2">{metrics.usersTrackingFood}</p>
          <p className="text-sm text-emerald-600 mt-2">Active food trackers</p>
        </div>

        {/* Total Monthly Spend */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow p-6 border border-emerald-200">
          <h3 className="text-sm font-medium text-emerald-700 uppercase">💰 Monthly Food Spend</h3>
          <p className="text-3xl font-bold text-emerald-900 mt-2">
            ${metrics.totalMonthlyFoodSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-emerald-600 mt-2">All users combined</p>
        </div>
      </div>

      {/* Food Tracking Activity */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Food Tracking Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pet Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Food Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Food Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Cost
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Left
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subscription
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allFoodEntries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.userEmail}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.petName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.food_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                    {entry.food_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    ${entry.monthlyCost.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {entry.daysLeft}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      entry.status === 'Urgent' ? 'bg-red-100 text-red-800' :
                      entry.status === 'Order Soon' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                    {entry.is_subscription ? (
                      <span className="text-emerald-600 font-semibold">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Food Tracking Summary */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">
              Total entries: {allFoodEntries.length}
            </span>
            <span className="font-semibold text-gray-900">
              Total monthly spend: ${allFoodEntries.reduce((sum, e) => sum + e.monthlyCost, 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Insurance Breakdown */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Claims by Insurance Company</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(metrics.insuranceBreakdown).map(([company, count]) => (
            <div key={company} className="border rounded-lg p-4">
              <p className="text-sm text-gray-600">{company}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  Email {sortColumn === 'email' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  Name {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('petsCount')}
                >
                  Pets {sortColumn === 'petsCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('claimsCount')}
                >
                  Claims {sortColumn === 'claimsCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('lastActive')}
                >
                  Last Active {sortColumn === 'lastActive' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedUsers.map(user => (
                <React.Fragment key={user.profile.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedUserId(expandedUserId === user.profile.id ? null : user.profile.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.profile.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.profile.full_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {user.petsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {user.claimsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(user.lastActive).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                  </tr>
                  {expandedUserId === user.profile.id && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          {/* User Details */}
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">User Details</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div><span className="text-gray-600">Phone:</span> {user.profile.phone_number || 'Not set'}</div>
                              <div><span className="text-gray-600">Timezone:</span> {user.profile.timezone || 'Not set'}</div>
                              <div><span className="text-gray-600">SMS Opt-in:</span> {user.profile.sms_opt_in ? 'Yes' : 'No'}</div>
                              <div><span className="text-gray-600">Email Reminders:</span> {user.profile.email_reminders ? 'Yes' : 'No'}</div>
                            </div>
                          </div>

                          {/* Pets */}
                          {user.pets.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-2">Pets ({user.pets.length})</h4>
                              <div className="space-y-2">
                                {user.pets.map(pet => (
                                  <div key={pet.id} className="bg-white border rounded p-3 text-sm">
                                    <div className="font-medium">{pet.name} - {pet.species}</div>
                                    <div className="text-gray-600">
                                      {pet.insurance_company} • Policy: {pet.policy_number || 'Not set'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recent Claims */}
                          {user.claims.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-2">
                                Recent Claims ({user.claims.length}) - Total: ${user.totalClaimAmount.toFixed(2)}
                              </h4>
                              <div className="space-y-2">
                                {user.claims.slice(0, 5).map(claim => (
                                  <div key={claim.id} className="bg-white border rounded p-3 text-sm">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="font-medium">{claim.clinic_name || 'Unknown Clinic'}</div>
                                        <div className="text-gray-600">
                                          {claim.service_date ? (parseYmdLocal(claim.service_date)?.toLocaleDateString() || 'No date') : 'No date'} •
                                          ${claim.total_amount?.toFixed(2) || '0.00'}
                                        </div>
                                      </div>
                                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getFilingStatusBadge(claim.filing_status || 'draft')}`}>
                                        {claim.filing_status || 'draft'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                                {user.claims.length > 5 && (
                                  <div className="text-sm text-gray-600">
                                    + {user.claims.length - 5} more claims
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Claims Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">All Claims</h2>
            <div className="flex gap-4">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="paid">Paid</option>
              </select>

              {/* Insurance Filter */}
              <select
                value={insuranceFilter}
                onChange={(e) => setInsuranceFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Insurance</option>
                {Object.keys(metrics.insuranceBreakdown).map(company => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pet
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Service Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Insurance
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PDF
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClaims.map(claim => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{claim.userName}</div>
                    <div className="text-sm text-gray-500">{claim.userEmail}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {claim.petName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {claim.service_date ? (parseYmdLocal(claim.service_date)?.toLocaleDateString() || '-') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    ${claim.total_amount?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getFilingStatusBadge(claim.filing_status || 'draft')}`}>
                      {claim.filing_status || 'draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {claim.insuranceCompany}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {claim.pdf_path ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Claims Summary */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">
              Showing {filteredClaims.length} of {allClaims.length} claims
            </span>
            <span className="font-semibold text-gray-900">
              Total: ${filteredClaims.reduce((sum, c) => sum + (c.total_amount || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
