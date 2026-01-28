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

interface FoodTrackingUserStats {
  email: string;
  foodsTracked: number;
  petsWithFood: number;
  totalMonthlySpend: number;
  firstEntryDate: string;
  mostRecentActivity: string;
  subscriptions: number;
  alerts: number;
}

interface UserLogin {
  id: string;
  user_id: string;
  email: string;
  is_demo_account: boolean;
  logged_in_at: string;
  user_agent: string | null;
  created_at: string;
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

// Helper function for relative time display
function getRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
  const [recentLogins, setRecentLogins] = useState<UserLogin[]>([]);
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

      // Load recent logins
      const { data: logins, error: loginsError } = await supabase
        .from('user_logins')
        .select('*')
        .order('logged_in_at', { ascending: false })
        .limit(50);

      if (loginsError) {
        console.error('Error loading logins (table may not exist yet):', loginsError);
        // Don't throw - logins table might not exist yet
      }

      setUsers(usersWithStats);
      setAllClaims(claimsWithDetails);
      setAllFoodEntries(foodEntriesWithDetails);
      setRecentLogins(logins || []);
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

  // Calculate food tracking user stats
  const foodTrackingUserStats = useMemo(() => {
    const userStatsMap = new Map<string, FoodTrackingUserStats>();

    allFoodEntries.forEach(entry => {
      const existing = userStatsMap.get(entry.userEmail);

      if (existing) {
        existing.foodsTracked += 1;
        existing.totalMonthlySpend += entry.monthlyCost;
        if (entry.is_subscription) existing.subscriptions += 1;
        if (entry.status === 'Order Soon' || entry.status === 'Urgent') existing.alerts += 1;

        // Update most recent activity
        const entryDate = new Date(entry.updated_at || entry.created_at);
        const currentMostRecent = new Date(existing.mostRecentActivity);
        if (entryDate > currentMostRecent) {
          existing.mostRecentActivity = entry.updated_at || entry.created_at;
        }

        // Update first entry date
        const currentFirst = new Date(existing.firstEntryDate);
        if (entryDate < currentFirst) {
          existing.firstEntryDate = entry.created_at;
        }
      } else {
        userStatsMap.set(entry.userEmail, {
          email: entry.userEmail,
          foodsTracked: 1,
          petsWithFood: 0, // Will calculate after
          totalMonthlySpend: entry.monthlyCost,
          firstEntryDate: entry.created_at,
          mostRecentActivity: entry.updated_at || entry.created_at,
          subscriptions: entry.is_subscription ? 1 : 0,
          alerts: (entry.status === 'Order Soon' || entry.status === 'Urgent') ? 1 : 0
        });
      }
    });

    // Calculate unique pets per user
    const userPetsMap = new Map<string, Set<string>>();
    allFoodEntries.forEach(entry => {
      if (!userPetsMap.has(entry.userEmail)) {
        userPetsMap.set(entry.userEmail, new Set());
      }
      userPetsMap.get(entry.userEmail)!.add(entry.petName);
    });

    // Update petsWithFood count
    userStatsMap.forEach((stats, email) => {
      stats.petsWithFood = userPetsMap.get(email)?.size || 0;
    });

    // Convert to array and sort by most recent activity (descending)
    return Array.from(userStatsMap.values()).sort((a, b) => {
      return new Date(b.mostRecentActivity).getTime() - new Date(a.mostRecentActivity).getTime();
    });
  }, [allFoodEntries]);

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
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-gray-500 mt-2 text-lg">System overview and user management</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {/* Users */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
              <span className="text-xl">👥</span>
            </div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Users</h3>
          </div>
          <p className="text-4xl font-bold text-gray-900">{metrics.totalUsers}</p>
          <div className="mt-3 text-sm font-medium">
            <span className="text-emerald-600">Active: {metrics.activeUsers}</span>
            <span className="text-gray-300 mx-2">•</span>
            <span className="text-red-500">Inactive: {metrics.inactiveUsers}</span>
          </div>
        </div>

        {/* Pets */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
              <span className="text-xl">🐾</span>
            </div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Pets</h3>
          </div>
          <p className="text-4xl font-bold text-gray-900">{metrics.totalPets}</p>
          <p className="text-sm text-gray-500 mt-3 font-medium">Across all users</p>
        </div>

        {/* Claims */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
              <span className="text-xl">📋</span>
            </div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Claims</h3>
          </div>
          <p className="text-4xl font-bold text-gray-900">{metrics.totalClaims}</p>
          <div className="mt-3 text-sm font-medium">
            <span className="text-gray-500">Draft: {metrics.draftClaims}</span>
            <span className="text-gray-300 mx-2">•</span>
            <span className="text-blue-600">Submitted: {metrics.submittedClaims}</span>
            <span className="text-gray-300 mx-2">•</span>
            <span className="text-emerald-600">Paid: {metrics.paidClaims}</span>
          </div>
        </div>

        {/* Total Amount */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-xl shadow-emerald-500/25 p-6 hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
            <h3 className="text-sm font-bold text-emerald-100 uppercase tracking-wider">Total Amount</h3>
          </div>
          <p className="text-4xl font-bold text-white">
            ${metrics.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-emerald-100 mt-3 font-medium">All claims combined</p>
        </div>
      </div>

      {/* Recent Claim Activity Feed */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 mb-10 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
          <h2 className="text-xl font-bold text-gray-900">Recent Claim Activity</h2>
          <p className="text-sm text-gray-500 mt-1">Latest claim submissions</p>
        </div>
        <div className="divide-y divide-gray-100">
          {allClaims
            .filter(c => ['filed', 'submitted', 'paid'].includes((c.filing_status || '').toLowerCase()))
            .sort((a, b) => {
              const dateA = new Date(a.filed_date || a.created_at || 0).getTime();
              const dateB = new Date(b.filed_date || b.created_at || 0).getTime();
              return dateB - dateA;
            })
            .slice(0, 10)
            .map(claim => {
              const emailPrefix = (claim.userEmail || '').split('@')[0];
              const amount = typeof claim.total_amount === 'number'
                ? `$${claim.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '$0.00';
              const activityDate = claim.filed_date || claim.created_at;
              const relativeTime = getRelativeTime(activityDate);
              const status = (claim.filing_status || '').toLowerCase();
              const action = status === 'paid' ? 'received payment for' : 'filed a claim to';

              return (
                <div key={claim.id} className="px-6 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{emailPrefix}@</span>
                      <span className="text-gray-600"> {action} </span>
                      <span className="font-medium text-blue-600">{claim.insuranceCompany}</span>
                      <span className="text-gray-600"> for </span>
                      <span className="font-medium text-gray-900">{claim.petName}</span>
                      <span className="text-gray-600"> (</span>
                      <span className="font-semibold text-emerald-600">{amount}</span>
                      <span className="text-gray-600">)</span>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-4">{relativeTime}</span>
                  </div>
                </div>
              );
            })}
          {allClaims.filter(c => ['filed', 'submitted', 'paid'].includes((c.filing_status || '').toLowerCase())).length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No claim submissions yet
            </div>
          )}
        </div>
      </div>

      {/* Recent Logins */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 mb-10 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
          <h2 className="text-xl font-bold text-gray-900">Recent Logins</h2>
          <p className="text-sm text-gray-500 mt-1">Last 50 user logins</p>
        </div>
        <div className="divide-y divide-gray-100">
          {recentLogins.length > 0 ? (
            recentLogins.map(login => {
              const emailPrefix = (login.email || '').split('@')[0];
              const domain = (login.email || '').split('@')[1] || '';
              const relativeTime = getRelativeTime(login.logged_in_at);
              const isMobile = login.user_agent?.toLowerCase().includes('mobile') ||
                              login.user_agent?.toLowerCase().includes('iphone') ||
                              login.user_agent?.toLowerCase().includes('android');
              const deviceIcon = isMobile ? '📱' : '💻';

              return (
                <div key={login.id} className="px-6 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{deviceIcon}</span>
                      <div className="text-sm">
                        <span className="font-medium text-gray-900">{emailPrefix}@</span>
                        <span className="text-gray-500">{domain}</span>
                        {login.is_demo_account && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                            Demo
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-4">{relativeTime}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No login records yet. Run the SQL migration to create the user_logins table.
            </div>
          )}
        </div>
        {recentLogins.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Total shown: {recentLogins.length}</span>
              <span>
                Demo accounts: {recentLogins.filter(l => l.is_demo_account).length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* HIDDEN: Food Tracking Metrics - set to true to re-enable */}
      {false && (
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
      )}

      {/* HIDDEN: Food Tracking Users - set to true to re-enable */}
      {false && (
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Food Tracking Users</h2>
          <p className="text-sm text-gray-600 mt-1">User engagement and activity summary</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Foods Tracked
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pets w/ Food
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Spend
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  First Entry
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recent Activity
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subscriptions
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Alerts
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {foodTrackingUserStats.map(userStat => (
                <tr key={userStat.email} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {userStat.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {userStat.foodsTracked}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {userStat.petsWithFood}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    ${userStat.totalMonthlySpend.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(userStat.firstEntryDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(userStat.mostRecentActivity).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {userStat.subscriptions > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {userStat.subscriptions}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {userStat.alerts > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {userStat.alerts}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Summary */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="text-sm text-gray-600">
            Showing {foodTrackingUserStats.length} {foodTrackingUserStats.length === 1 ? 'user' : 'users'} tracking food
          </div>
        </div>
      </div>
      )}

      {/* HIDDEN: Food Tracking Activity - set to true to re-enable */}
      {false && (
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Food Tracking Activity</h2>
          <p className="text-sm text-gray-600 mt-1">Detailed per-food entry view</p>
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
      )}

      {/* Insurance Breakdown */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 p-6 mb-10">
        <h3 className="text-xl font-bold text-gray-900 mb-5">Claims by Insurance Company</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(metrics.insuranceBreakdown).map(([company, count]) => (
            <div key={company} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <p className="text-sm font-medium text-gray-500">{company}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 mb-10 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
          <h2 className="text-xl font-bold text-gray-900">Users</h2>
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
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-white/60 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">All Claims</h2>
            <div className="flex gap-3">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium bg-white shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
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
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium bg-white shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
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
