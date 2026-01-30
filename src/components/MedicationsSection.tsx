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

type MedicationWithStats = MedicationRow & {
  pet_name: string
  pet_species: string
  totalDoses: number       // Total doses in the course
  dosesGiven: number       // Total doses given (all time)
  dosesLeft: number        // Remaining doses
  dosesGivenToday: number  // Doses given today
  dosesExpectedToday: number // Doses expected today
  isFiniteCourse: boolean  // Has an end date
}

export default function MedicationsSection({ userId, pets, onAddMedication, onManage, refreshKey }: MedicationsSectionProps) {
  const [medications, setMedications] = useState<MedicationWithStats[]>([])
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

        const medIds = (data || []).map((m: any) => m.id)

        // Fetch ALL given doses for these medications (for total count)
        let allGivenDoses: any[] = []
        let todayDoses: any[] = []

        if (medIds.length > 0) {
          // All given doses
          const { data: allDoses } = await supabase
            .from('medication_doses')
            .select('medication_id')
            .in('medication_id', medIds)
            .eq('status', 'given')
          allGivenDoses = allDoses || []

          // Today's given doses
          const { data: todayData } = await supabase
            .from('medication_doses')
            .select('medication_id')
            .in('medication_id', medIds)
            .gte('given_time', todayStart)
            .lte('given_time', todayEnd)
            .eq('status', 'given')
          todayDoses = todayData || []
        }

        // Count doses per medication
        const totalGivenByMed: Record<string, number> = {}
        allGivenDoses.forEach((d: any) => {
          totalGivenByMed[d.medication_id] = (totalGivenByMed[d.medication_id] || 0) + 1
        })

        const todayGivenByMed: Record<string, number> = {}
        todayDoses.forEach((d: any) => {
          todayGivenByMed[d.medication_id] = (todayGivenByMed[d.medication_id] || 0) + 1
        })

        const medsWithStats = (data || []).map((med: any) => {
          const isFiniteCourse = !!med.end_date

          // Calculate doses per day
          let dosesPerDay = 1
          if (Array.isArray(med.reminder_times)) {
            dosesPerDay = med.reminder_times.length
          } else if (med.reminder_times?.type === 'as_needed') {
            dosesPerDay = 0
          } else if (med.reminder_times?.type === 'monthly' || med.reminder_times?.type === 'weekly' || med.reminder_times?.type === 'quarterly') {
            dosesPerDay = 0 // Not daily
          }

          // Calculate total doses for finite courses
          let totalDoses = 0
          if (isFiniteCourse && med.start_date && dosesPerDay > 0) {
            const start = new Date(med.start_date)
            const end = new Date(med.end_date)
            const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
            totalDoses = days * dosesPerDay
          }

          const dosesGiven = totalGivenByMed[med.id] || 0
          const dosesLeft = Math.max(0, totalDoses - dosesGiven)

          return {
            ...med,
            pet_name: med.pets?.name || 'Unknown Pet',
            pet_species: med.pets?.species || 'dog',
            totalDoses,
            dosesGiven,
            dosesLeft,
            dosesGivenToday: todayGivenByMed[med.id] || 0,
            dosesExpectedToday: dosesPerDay,
            isFiniteCourse
          }
        })

        setMedications(medsWithStats)
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

  // Get dosage + frequency + time display line
  const getDosageFrequencyLine = (med: MedicationWithStats): string => {
    const parts: string[] = []

    // Dosage
    if (med.dosage) {
      parts.push(med.dosage)
    }

    // Frequency + times
    const reminderTimes = med.reminder_times
    if (Array.isArray(reminderTimes)) {
      if (reminderTimes.length === 1) {
        parts.push(`Once daily`)
        parts.push(formatTime12Hour(reminderTimes[0]))
      } else if (reminderTimes.length === 2) {
        parts.push(`Twice daily`)
      } else if (reminderTimes.length === 3) {
        parts.push(`3x daily`)
      }
    } else if (reminderTimes && typeof reminderTimes === 'object') {
      const rt = reminderTimes as any
      if (rt.type === 'weekly') parts.push('Weekly')
      else if (rt.type === 'monthly') parts.push('Monthly')
      else if (rt.type === 'quarterly') parts.push('Every 3 months')
      else if (rt.type === 'as_needed') parts.push('As needed')
    }

    return parts.join(' · ')
  }

  // Get status line with doses left and due status
  const getStatusLine = (med: MedicationWithStats): { text: string; color: string } => {
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const reminderTimes = med.reminder_times

    // Handle non-finite courses (monthly, weekly, ongoing)
    if (!med.isFiniteCourse || med.dosesExpectedToday === 0) {
      // Monthly/weekly medications
      if (reminderTimes && typeof reminderTimes === 'object') {
        const rt = reminderTimes as any

        if (rt.type === 'monthly') {
          const todayDayOfMonth = now.getDate()
          if (todayDayOfMonth === rt.dayOfMonth) {
            if (med.dosesGivenToday > 0) {
              // Calculate next month
              const nextMonth = new Date(now)
              nextMonth.setMonth(nextMonth.getMonth() + 1)
              const monthName = nextMonth.toLocaleString('en-US', { month: 'short' })
              return { text: `Given · Next: ${monthName} ${rt.dayOfMonth}`, color: 'text-green-600' }
            } else if (currentTime < rt.time) {
              return { text: `Due today at ${formatTime12Hour(rt.time)}`, color: 'text-orange-600' }
            } else {
              return { text: `Overdue ${formatTime12Hour(rt.time)}`, color: 'text-red-600' }
            }
          } else {
            const nextMonth = todayDayOfMonth > rt.dayOfMonth ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now
            const monthName = nextMonth.toLocaleString('en-US', { month: 'short' })
            return { text: `Next: ${monthName} ${rt.dayOfMonth}`, color: 'text-gray-500' }
          }
        }

        if (rt.type === 'weekly') {
          const todayDayOfWeek = now.getDay()
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          if (todayDayOfWeek === rt.dayOfWeek) {
            if (med.dosesGivenToday > 0) {
              return { text: `Given · Next: ${dayNames[rt.dayOfWeek]}`, color: 'text-green-600' }
            } else if (currentTime < rt.time) {
              return { text: `Due today at ${formatTime12Hour(rt.time)}`, color: 'text-orange-600' }
            } else {
              return { text: `Overdue ${formatTime12Hour(rt.time)}`, color: 'text-red-600' }
            }
          } else {
            return { text: `Next: ${dayNames[rt.dayOfWeek]}`, color: 'text-gray-500' }
          }
        }

        if (rt.type === 'as_needed') {
          return { text: 'As needed', color: 'text-gray-500' }
        }
      }
      return { text: 'Ongoing', color: 'text-gray-500' }
    }

    // Finite course - daily medications
    if (!Array.isArray(reminderTimes)) {
      return { text: `${med.dosesLeft} doses left`, color: 'text-gray-500' }
    }

    const sortedTimes = [...reminderTimes].sort()

    // Check if complete (all doses given)
    if (med.dosesLeft === 0) {
      return { text: 'Complete', color: 'text-green-600' }
    }

    // Find the dose status for today
    const passedTimes = sortedTimes.filter(time => time <= currentTime)
    const overdueCount = Math.max(0, passedTimes.length - med.dosesGivenToday)

    // Last dose special case
    if (med.dosesLeft === 1) {
      if (overdueCount > 0) {
        const lastOverdueTime = passedTimes[passedTimes.length - 1]
        return { text: `Last dose! · Overdue ${formatTime12Hour(lastOverdueTime)}`, color: 'text-red-600' }
      }
      const nextTime = sortedTimes.find(time => time > currentTime)
      if (nextTime) {
        const [h, m] = nextTime.split(':')
        const reminderMinutes = parseInt(h) * 60 + parseInt(m)
        const diff = reminderMinutes - currentMinutes
        if (diff <= 60) {
          return { text: `Last dose! · Due at ${formatTime12Hour(nextTime)}`, color: 'text-orange-600' }
        }
        return { text: `Last dose! · Next: Tomorrow ${formatTime12Hour(nextTime)}`, color: 'text-gray-600' }
      }
      return { text: `Last dose! · Tomorrow ${formatTime12Hour(sortedTimes[0])}`, color: 'text-gray-600' }
    }

    // Overdue
    if (overdueCount > 0) {
      const lastOverdueTime = passedTimes[passedTimes.length - 1]
      return { text: `${med.dosesLeft} doses left · Overdue ${formatTime12Hour(lastOverdueTime)}`, color: 'text-red-600' }
    }

    // Find next time
    const nextTime = sortedTimes.find(time => time > currentTime)

    // All times passed for today - all given
    if (!nextTime) {
      if (med.dosesGivenToday >= med.dosesExpectedToday) {
        // All today's doses given
        return { text: `${med.dosesLeft} doses left · Next: Tomorrow ${formatTime12Hour(sortedTimes[0])}`, color: 'text-green-600' }
      }
      return { text: `${med.dosesLeft} doses left · Tomorrow ${formatTime12Hour(sortedTimes[0])}`, color: 'text-gray-500' }
    }

    // Check if due now (within 60 min)
    const [h, m] = nextTime.split(':')
    const reminderMinutes = parseInt(h) * 60 + parseInt(m)
    const diff = reminderMinutes - currentMinutes

    if (diff <= 60 && diff > 0) {
      return { text: `${med.dosesLeft} doses left · Due at ${formatTime12Hour(nextTime)}`, color: 'text-orange-600' }
    }

    // Not due yet today
    return { text: `${med.dosesLeft} doses left · Next: ${formatTime12Hour(nextTime)}`, color: 'text-gray-500' }
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
    return (
      <section className="mx-auto max-w-4xl px-4 mt-8">
        <div className="rounded-3xl p-6 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 relative overflow-hidden shadow-2xl shadow-emerald-600/30">
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
            const dosageFrequency = getDosageFrequencyLine(med)
            const status = getStatusLine(med)

            return (
              <div key={med.id} className="bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
                    💊
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Medication name */}
                    <div className="font-bold text-gray-800">{med.medication_name}</div>
                    {/* Dosage + Frequency + Time */}
                    <div className="text-sm text-gray-600 mt-0.5">{dosageFrequency}</div>
                    {/* Doses left + Status */}
                    <div className={`text-sm font-medium mt-1 ${status.color}`}>
                      {status.text}
                    </div>
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
