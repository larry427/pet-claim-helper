import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

interface Medication {
  id: string
  user_id: string
  pet_id: string
  medication_name: string
  dosage: string | null
  frequency: string
  reminder_times: string[] | any
  start_date: string
  end_date: string | null
  created_at: string
}

interface Dose {
  id: string
  medication_id: string
  user_id: string
  scheduled_time: string
  given_time: string | null
  status: 'pending' | 'given' | 'skipped'
  short_code: string | null
}

interface MedicationWithDetails extends Medication {
  petName: string
  userEmail: string
  doses: Dose[]
  givenCount: number
  totalExpectedDoses: number
  daysRemaining: number
  status: 'active' | 'completed' | 'future'
}

export default function MedicationAdminDashboard() {
  const [medications, setMedications] = useState<MedicationWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedMedId, setExpandedMedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      // Load all medications with pet and user info
      const { data: meds, error: medsError } = await supabase
        .from('medications')
        .select(`
          *,
          pets (id, name),
          profiles (id, email)
        `)
        .order('created_at', { ascending: false })

      if (medsError) throw medsError

      // Load all doses
      const { data: allDoses, error: dosesError } = await supabase
        .from('medication_doses')
        .select('*')
        .order('scheduled_time', { ascending: true })

      if (dosesError) throw dosesError

      // Group doses by medication_id
      const dosesByMed: Record<string, Dose[]> = {}
      for (const dose of (allDoses || [])) {
        if (!dosesByMed[dose.medication_id]) {
          dosesByMed[dose.medication_id] = []
        }
        dosesByMed[dose.medication_id].push(dose)
      }

      // Build medication details
      const today = new Date()
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      const medsWithDetails: MedicationWithDetails[] = (meds || []).map(med => {
        const doses = dosesByMed[med.id] || []
        const givenCount = doses.filter(d => d.status === 'given').length

        // Calculate total expected doses
        let totalExpectedDoses = 0
        let daysRemaining = 0
        let status: 'active' | 'completed' | 'future' = 'active'

        if (med.start_date && med.end_date) {
          const [startYear, startMonth, startDay] = med.start_date.split('-').map(Number)
          const startDate = new Date(startYear, startMonth - 1, startDay)
          const [endYear, endMonth, endDay] = med.end_date.split('-').map(Number)
          const endDate = new Date(endYear, endMonth - 1, endDay)

          const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
          const dosesPerDay = Array.isArray(med.reminder_times) ? med.reminder_times.length : 1
          totalExpectedDoses = totalDays * dosesPerDay

          // Days remaining
          const diffDays = Math.round((endDate.getTime() - todayDay.getTime()) / 86400000)
          daysRemaining = Math.max(0, diffDays)

          // Status
          if (todayDay < startDate) {
            status = 'future'
          } else if (givenCount >= totalExpectedDoses || todayDay > endDate) {
            status = 'completed'
          } else {
            status = 'active'
          }
        }

        return {
          ...med,
          petName: med.pets?.name || 'Unknown',
          userEmail: med.profiles?.email || 'Unknown',
          doses,
          givenCount,
          totalExpectedDoses,
          daysRemaining,
          status
        }
      })

      setMedications(medsWithDetails)
    } catch (err: any) {
      console.error('Error loading medication admin data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Calculate overview metrics
  const metrics = useMemo(() => {
    const totalMedications = medications.length
    const allDoses = medications.flatMap(m => m.doses)
    const totalDoses = allDoses.length
    const pendingDoses = allDoses.filter(d => d.status === 'pending').length
    const givenDoses = allDoses.filter(d => d.status === 'given').length
    const skippedDoses = allDoses.filter(d => d.status === 'skipped').length

    return {
      totalMedications,
      totalDoses,
      pendingDoses,
      givenDoses,
      skippedDoses
    }
  }, [medications])

  async function handleResetDoses(medicationId: string) {
    if (!confirm('Are you sure you want to delete ALL dose records for this medication? This cannot be undone.')) {
      return
    }

    setActionLoading(medicationId)
    try {
      const { error } = await supabase
        .from('medication_doses')
        .delete()
        .eq('medication_id', medicationId)

      if (error) throw error

      alert('All doses deleted successfully')
      await loadData()
    } catch (err: any) {
      alert('Error deleting doses: ' + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeleteMedication(medicationId: string, medicationName: string) {
    if (!confirm(`Are you sure you want to delete "${medicationName}" and ALL its dose records? This cannot be undone.`)) {
      return
    }

    setActionLoading(medicationId)
    try {
      // Delete doses first (should cascade, but being explicit)
      await supabase
        .from('medication_doses')
        .delete()
        .eq('medication_id', medicationId)

      // Delete medication
      const { error } = await supabase
        .from('medications')
        .delete()
        .eq('id', medicationId)

      if (error) throw error

      alert('Medication deleted successfully')
      await loadData()
    } catch (err: any) {
      alert('Error deleting medication: ' + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeleteDose(doseId: string) {
    if (!confirm('Delete this dose record?')) {
      return
    }

    setActionLoading(doseId)
    try {
      const { error } = await supabase
        .from('medication_doses')
        .delete()
        .eq('id', doseId)

      if (error) throw error

      await loadData()
    } catch (err: any) {
      alert('Error deleting dose: ' + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'future':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  function getDoseStatusBadge(status: string) {
    switch (status) {
      case 'given':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'skipped':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  function formatDateTime(isoString: string | null) {
    if (!isoString) return '-'
    const date = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z')
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading medication admin data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">Error loading data</h2>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Medication Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Testing and debugging tools for medications</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total Medications</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.totalMedications}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total Dose Records</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics.totalDoses}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-yellow-600 uppercase">Pending Doses</h3>
          <p className="text-3xl font-bold text-yellow-600 mt-2">{metrics.pendingDoses}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-green-600 uppercase">Given Doses</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{metrics.givenDoses}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-red-600 uppercase">Skipped Doses</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">{metrics.skippedDoses}</p>
        </div>
      </div>

      {/* Medications Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">All Medications</h2>
            <p className="text-sm text-gray-600 mt-1">Click a row to expand dose details</p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pet Name
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Medication
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  End Date
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Left
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {medications.map(med => (
                <React.Fragment key={med.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedMedId(expandedMedId === med.id ? null : med.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {med.petName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleResetDoses(med.id)}
                          disabled={actionLoading === med.id}
                          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 disabled:opacity-50"
                          title="Delete all dose records"
                        >
                          Reset Doses
                        </button>
                        <button
                          onClick={() => handleDeleteMedication(med.id, med.medication_name)}
                          disabled={actionLoading === med.id}
                          className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50"
                          title="Delete medication and all doses"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {med.userEmail}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {med.medication_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {med.frequency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {med.start_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {med.end_date || 'Ongoing'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="font-medium">{med.givenCount}</span>
                      <span className="text-gray-400">/</span>
                      <span>{med.totalExpectedDoses}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {med.daysRemaining}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(med.status)}`}>
                        {med.status}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded Dose Details */}
                  {expandedMedId === med.id && (
                    <tr>
                      <td colSpan={10} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900">
                            Dose Records ({med.doses.length})
                          </h4>
                          {med.doses.length === 0 ? (
                            <p className="text-sm text-gray-500">No dose records yet</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Dose ID
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Scheduled Time
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Status
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Given Time
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Short Code
                                    </th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                      Action
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {med.doses.map(dose => (
                                    <tr key={dose.id} className="hover:bg-gray-50">
                                      <td className="px-4 py-2 text-gray-600 font-mono text-xs">
                                        {dose.id.slice(0, 8)}...
                                      </td>
                                      <td className="px-4 py-2 text-gray-900">
                                        {formatDateTime(dose.scheduled_time)}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getDoseStatusBadge(dose.status)}`}>
                                          {dose.status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-gray-600">
                                        {formatDateTime(dose.given_time)}
                                      </td>
                                      <td className="px-4 py-2 text-gray-600 font-mono">
                                        {dose.short_code || '-'}
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                        <button
                                          onClick={() => handleDeleteDose(dose.id)}
                                          disabled={actionLoading === dose.id}
                                          className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50"
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
        {/* Summary */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="text-sm text-gray-600">
            Showing {medications.length} medications across all users
          </div>
        </div>
      </div>
    </div>
  )
}
