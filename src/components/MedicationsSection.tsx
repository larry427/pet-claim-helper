import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PetProfile, MedicationRow } from '../types'

type MedicationsSectionProps = {
  userId: string | null
  pets: PetProfile[]
  onAddMedication: () => void
  onManage: () => void
  refreshKey?: number
}

type MedicationWithPet = MedicationRow & {
  pet_name: string
  pet_species: string
}

type MedicationStatus = {
  label: string
  color: 'orange' | 'emerald' | 'green'
}

export default function MedicationsSection({ userId, pets, onAddMedication, onManage, refreshKey }: MedicationsSectionProps) {
  const [medications, setMedications] = useState<MedicationWithPet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const fetchMedications = async () => {
      setLoading(true)
      try {
        const today = new Date().toISOString().split('T')[0]

        // Fetch active medications (end_date IS NULL OR end_date >= today)
        const { data, error } = await supabase
          .from('medications')
          .select('*, pets(name, species)')
          .eq('user_id', userId)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('created_at', { ascending: false })
          .limit(3)

        if (error) throw error

        const medsWithPets = (data || []).map((med: any) => ({
          ...med,
          pet_name: med.pets?.name || 'Unknown Pet',
          pet_species: med.pets?.species || 'dog'
        }))

        setMedications(medsWithPets)
      } catch (err) {
        console.error('Error fetching medications:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMedications()
  }, [userId, refreshKey])

  const calculateStatus = (med: MedicationWithPet): MedicationStatus => {
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const currentDate = now.toISOString().split('T')[0]

    const reminderTimes = med.reminder_times

    // Check if already given today (would need to query medication_doses table)
    // For now, simplified logic without database query

    if (Array.isArray(reminderTimes)) {
      // Daily frequencies
      const withinOneHour = reminderTimes.some(time => {
        const [hour, minute] = time.split(':')
        const reminderMinutes = parseInt(hour) * 60 + parseInt(minute)
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        const diff = Math.abs(currentMinutes - reminderMinutes)
        return diff <= 60
      })

      if (withinOneHour) {
        return { label: 'Due Now', color: 'orange' }
      }

      const nextTime = reminderTimes.find(time => time > currentTime)
      if (nextTime) {
        return { label: 'Later today', color: 'emerald' }
      }

      return { label: 'Tomorrow', color: 'emerald' }
    } else if (reminderTimes && typeof reminderTimes === 'object') {
      const rt = reminderTimes as any

      if (rt.type === 'weekly') {
        const todayDayOfWeek = now.getDay() // 0=Sunday, 1=Monday, etc
        if (todayDayOfWeek === rt.dayOfWeek && currentTime < rt.time) {
          return { label: 'Today', color: 'orange' }
        }
        const daysUntil = (rt.dayOfWeek - todayDayOfWeek + 7) % 7
        return { label: `In ${daysUntil} days`, color: 'emerald' }
      } else if (rt.type === 'monthly') {
        const todayDayOfMonth = now.getDate()
        if (todayDayOfMonth === rt.dayOfMonth && currentTime < rt.time) {
          return { label: 'Due today', color: 'orange' }
        }
        const daysUntil = rt.dayOfMonth - todayDayOfMonth
        if (daysUntil > 0) {
          return { label: `In ${daysUntil} days`, color: 'emerald' }
        }
        return { label: 'Next month', color: 'emerald' }
      } else if (rt.type === 'quarterly') {
        return { label: 'Quarterly', color: 'emerald' }
      } else if (rt.type === 'as_needed') {
        return { label: 'As needed', color: 'emerald' }
      }
    }

    return { label: 'Active', color: 'green' }
  }

  const getFrequencyDisplay = (med: MedicationWithPet): string => {
    const reminderTimes = med.reminder_times

    if (Array.isArray(reminderTimes)) {
      // Daily frequencies
      if (reminderTimes.length === 1) return `Daily • ${reminderTimes[0]}`
      if (reminderTimes.length === 2) return `2x daily`
      if (reminderTimes.length === 3) return `3x daily`
      return 'Daily'
    } else if (reminderTimes && typeof reminderTimes === 'object') {
      const rt = reminderTimes as any
      if (rt.type === 'weekly') return 'Weekly'
      if (rt.type === 'monthly') return 'Monthly'
      if (rt.type === 'quarterly') return 'Every 3 months'
      if (rt.type === 'as_needed') return 'As needed'
    }

    return med.frequency || 'Daily'
  }

  const statusColors = {
    orange: 'bg-orange-100 text-orange-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    green: 'bg-green-100 text-green-600'
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-4xl px-4 mt-6">
        <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-600 to-emerald-700 relative overflow-hidden">
          <div className="text-white text-center py-8">Loading medications...</div>
        </div>
      </section>
    )
  }

  if (medications.length === 0) {
    // Empty state
    return (
      <section className="mx-auto max-w-4xl px-4 mt-6">
        <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-600 to-emerald-700 relative overflow-hidden">
          <div className="relative z-10 text-center py-8">
            <div className="text-5xl mb-4">💊</div>
            <h3 className="text-xl font-bold text-white mb-2">Track Your Pet's Medications</h3>
            <p className="text-emerald-50 text-sm mb-6">Get SMS reminders so you never miss a dose.</p>
            <button
              onClick={onAddMedication}
              className="bg-white text-emerald-600 px-6 py-3 rounded-xl font-semibold hover:bg-emerald-50 transition-colors shadow-lg"
            >
              + Add First Medication
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl px-4 mt-6">
      <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-600 to-emerald-700 relative overflow-hidden">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
              💊
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Medications</h3>
              <p className="text-emerald-50 text-xs">Never miss a dose</p>
            </div>
          </div>
          <button
            onClick={onManage}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Manage →
          </button>
        </div>

        {/* Medication cards */}
        <div className="relative z-10 space-y-3">
          {medications.map((med) => {
            const status = calculateStatus(med)
            const frequencyDisplay = getFrequencyDisplay(med)
            const petEmoji = med.pet_species === 'dog' ? '🐕' : '🐈'

            return (
              <div key={med.id} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-xl flex-shrink-0">
                    💊
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 truncate">{med.medication_name}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                      <span>{petEmoji} {med.pet_name}</span>
                      <span className="text-gray-400">•</span>
                      <span>{frequencyDisplay}</span>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColors[status.color]}`}>
                    {status.label}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add medication button */}
        <button
          onClick={onAddMedication}
          className="relative z-10 w-full mt-3 bg-white/15 hover:bg-white/25 border-2 border-dashed border-white/40 rounded-xl py-3 text-white font-medium transition-colors"
        >
          + Add Medication
        </button>
      </div>
    </section>
  )
}
