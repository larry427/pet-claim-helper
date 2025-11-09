import { DateTime } from 'luxon'

export function convertLocalToUTC(localTimeString: string, userTimezone: string): string {
	const [hh, mm] = String(localTimeString || '').split(':').map((x) => Number(x))
	if (!Number.isFinite(hh) || !Number.isFinite(mm)) return ''
	// Use an arbitrary date to anchor the time conversion
	const dt = DateTime.fromObject({ year: 2020, month: 1, day: 1, hour: hh, minute: mm }, { zone: userTimezone || 'local' })
	const asUtc = dt.toUTC()
	return asUtc.toFormat('HH:mm')
}

export function convertUTCToLocal(utcTimeString: string, userTimezone: string): string {
	const [hh, mm] = String(utcTimeString || '').split(':').map((x) => Number(x))
	if (!Number.isFinite(hh) || !Number.isFinite(mm)) return ''
	const dt = DateTime.fromObject({ year: 2020, month: 1, day: 1, hour: hh, minute: mm }, { zone: 'UTC' })
	const asLocal = dt.setZone(userTimezone || 'local')
	return asLocal.toFormat('HH:mm')
}

export function formatTimeForDisplay(utcTimeString: string, userTimezone: string): string {
	const [hh, mm] = String(utcTimeString || '').split(':').map((x) => Number(x))
	if (!Number.isFinite(hh) || !Number.isFinite(mm)) return ''
	const dt = DateTime.fromObject({ year: 2020, month: 1, day: 1, hour: hh, minute: mm }, { zone: 'UTC' })
	const asLocal = dt.setZone(userTimezone || 'local')
	return asLocal.toFormat('h:mm a')
}


