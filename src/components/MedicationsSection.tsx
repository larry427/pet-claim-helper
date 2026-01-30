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
  dosesGivenToday: number
  dosesExpectedToday: number
}

type MedicationStatus = {
  label: string
  color: 'red' | 'orange' | 'emerald' | 'green'
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
        const todayStart = `${today}T00:00:00`
        const todayEnd = `${today}T23:59:59`

        // Fetch active medications (end_date IS NULL OR end_date >= today)
        const { data, error } = await supabase
          .from('medications')
          .select('*, pets(name, species)')
          .eq('user_id', userId)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('created_at', { ascending: false })
          .limit(3)

        if (error) throw error

        // Fetch today's given doses for these medications
        const medIds = (data || []).map((m: any) => m.id)
        let todayDoses: any[] = []
        if (medIds.length > 0) {
          // Query doses given today (by given_time date)
          const { data: doses } = await supabase
            .from('medication_doses')
            .select('medication_id')
            .in('medication_id', medIds)
            .gte('given_time', todayStart)
            .lte('given_time', todayEnd)
            .eq('status', 'given')
          todayDoses = doses || []
        }

        // Count doses given today per medication
        const dosesGivenByMed: Record<string, number> = {}
        todayDoses.forEach((d: any) => {
          dosesGivenByMed[d.medication_id] = (dosesGivenByMed[d.medication_id] || 0) + 1
        })

        const medsWithPets = (data || []).map((med: any) => {
          // Calculate expected doses per day from reminder_times
          let dosesExpectedToday = 1
          if (Array.isArray(med.reminder_times)) {
            dosesExpectedToday = med.reminder_times.length
          } else if (med.reminder_times?.type === 'as_needed') {
            dosesExpectedToday = 0 // No expected doses for as-needed
          }

          return {
            ...med,
            pet_name: med.pets?.name || 'Unknown Pet',
            pet_species: med.pets?.species || 'dog',
            dosesGivenToday: dosesGivenByMed[med.id] || 0,
            dosesExpectedToday
          }
        })

        setMedications(medsWithPets)
      } catch (err) {
        console.error('Error fetching medications:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMedications()
  }, [userId, refreshKey])

  // Convert 24-hour time to 12-hour format with AM/PM
  const formatTime12Hour = (time24: string): string => {
    const [hourStr, minuteStr] = time24.split(':')
    let hour = parseInt(hourStr)
    const minute = minuteStr
    const ampm = hour >= 12 ? 'PM' : 'AM'

    hour = hour % 12
    if (hour === 0) hour = 12

    return `${hour}:${minute} ${ampm}`
  }

  const calculateStatus = (med: MedicationWithPet): MedicationStatus => {
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const reminderTimes = med.reminder_times

    // All today's doses given
    if (med.dosesExpectedToday > 0 && med.dosesGivenToday >= med.dosesExpectedToday) {
      return { label: 'All given ✓', color: 'green' }
    }

    if (Array.isArray(reminderTimes)) {
      // Daily frequencies - sort times chronologically
      const sortedTimes = [...reminderTimes].sort()

      // Find times that have passed without a dose
      const passedTimes = sortedTimes.filter(time => time <= currentTime)
      const overdueCount = Math.max(0, passedTimes.length - med.dosesGivenToday)

      // Check if overdue (a scheduled time has passed and not enough doses given)
      if (overdueCount > 0) {
        const lastOverdueTime = passedTimes[passedTimes.length - 1]
        return { label: `Overdue ${formatTime12Hour(lastOverdueTime)}`, color: 'red' }
      }

      // Check if within 1 hour of next scheduled time
      const nextTime = sortedTimes.find(time => time > currentTime)
      if (nextTime) {
        const [hour, minute] = nextTime.split(':')
        const reminderMinutes = parseInt(hour) * 60 + parseInt(minute)
        const diff = reminderMinutes - currentMinutes
        if (diff <= 60 && diff > 0) {
          return { label: `Due ${formatTime12Hour(nextTime)}`, color: 'orange' }
        }
        return { label: `Next ${formatTime12Hour(nextTime)}`, color: 'emerald' }
      }

      // All times passed for today, show partial if some given
      if (med.dosesGivenToday > 0) {
        return { label: `${med.dosesGivenToday}/${med.dosesExpectedToday} given`, color: 'orange' }
      }

      return { label: 'Tomorrow', color: 'emerald' }
    } else if (reminderTimes && typeof reminderTimes === 'object') {
      const rt = reminderTimes as any

      if (rt.type === 'weekly') {
        const todayDayOfWeek = now.getDay() // 0=Sunday, 1=Monday, etc
        if (todayDayOfWeek === rt.dayOfWeek) {
          if (currentTime < rt.time) {
            return { label: `Due ${formatTime12Hour(rt.time)}`, color: 'orange' }
          } else if (med.dosesGivenToday === 0) {
            return { label: `Overdue ${formatTime12Hour(rt.time)}`, color: 'red' }
          }
        }
        const daysUntil = (rt.dayOfWeek - todayDayOfWeek + 7) % 7 || 7
        return { label: `In ${daysUntil} days`, color: 'emerald' }
      } else if (rt.type === 'monthly') {
        const todayDayOfMonth = now.getDate()
        if (todayDayOfMonth === rt.dayOfMonth) {
          if (currentTime < rt.time) {
            return { label: `Due ${formatTime12Hour(rt.time)}`, color: 'orange' }
          } else if (med.dosesGivenToday === 0) {
            return { label: `Overdue ${formatTime12Hour(rt.time)}`, color: 'red' }
          }
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
      if (reminderTimes.length === 1) return `Daily • ${formatTime12Hour(reminderTimes[0])}`
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
    red: 'bg-red-100 text-red-600',
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
      <section className="mx-auto max-w-4xl px-4 mt-8">
        <div className="rounded-3xl p-6 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 relative overflow-hidden shadow-2xl shadow-emerald-600/30">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 text-center py-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4">
              <span className="text-5xl">💊</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Track Your Pet's Medications</h3>
            <p className="text-emerald-100 text-sm mb-6 max-w-sm mx-auto">Get SMS reminders so you never miss a dose.</p>
            <button
              onClick={onAddMedication}
              className="bg-white text-emerald-600 px-8 py-4 rounded-xl font-bold hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
            >
              + Add First Medication
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl px-4 mt-8">
      <div className="rounded-3xl p-6 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 relative overflow-hidden shadow-2xl shadow-emerald-600/30">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl shadow-lg">
              💊
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Medications</h3>
              <p className="text-emerald-100 text-xs">Never miss a dose</p>
            </div>
          </div>
          <button
            onClick={onManage}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] shadow-lg"
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
              <div key={med.id} className="bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
                    💊
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 truncate">{med.medication_name}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                      <span>{petEmoji} {med.pet_name}</span>
                      <span className="text-gray-300">•</span>
                      <span>{frequencyDisplay}</span>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${statusColors[status.color]}`}>
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
          className="relative z-10 w-full mt-4 bg-white/15 hover:bg-white/25 backdrop-blur-sm border-2 border-dashed border-white/40 rounded-xl py-4 text-white font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          + Add Medication
        </button>
      </div>
    </section>
  )
}
