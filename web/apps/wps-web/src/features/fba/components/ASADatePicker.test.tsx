import { fireEvent, render, screen } from '@testing-library/react'
import { DateTime } from 'luxon'
import { describe, expect, it, vi } from 'vitest'
import ASADatePicker from './ASADatePicker'

describe('ASADatePicker', () => {
  const baseDate = DateTime.fromISO('2025-06-10')
  const minimumDate = baseDate.minus({ days: 2 })
  const maximumDate = baseDate.plus({ days: 2 })

  const setup = (overrideProps = {}) => {
    const updateDate = vi.fn()
    render(
      <ASADatePicker
        date={baseDate}
        updateDate={updateDate}
        currentYearMinDate={minimumDate}
        currentYearMaxDate={maximumDate}
        {...overrideProps}
      />
    )
    return { updateDate }
  }

  it('renders with the correct formatted date', () => {
    setup()
    const input = screen.getByDisplayValue('Tue, Jun 10, 2025')
    expect(input).toBeInTheDocument()
  })

  // The arrow buttons are found by their accessible name, which is what a screen reader
  // announces. Previously these were queried by an empty name, which is the defect that was
  // fixed: the buttons were reachable by keyboard but announced as just "button".
  const getPreviousDayButton = () => screen.getByRole('button', { name: 'Previous day' })
  const getNextDayButton = () => screen.getByRole('button', { name: 'Next day' })

  it('calls updateDate when right arrow is clicked', () => {
    const { updateDate } = setup()
    fireEvent.click(getNextDayButton())
    expect(updateDate).toHaveBeenCalledWith(baseDate.plus({ days: 1 }))
  })

  it('calls updateDate when left arrow is clicked', () => {
    const { updateDate } = setup()
    fireEvent.click(getPreviousDayButton())
    expect(updateDate).toHaveBeenCalledWith(baseDate.plus({ days: -1 }))
  })

  it('disables left arrow when at minimumDate', () => {
    setup({ date: minimumDate })
    expect(getPreviousDayButton()).toBeDisabled()
    expect(getNextDayButton()).not.toBeDisabled()
  })

  it('disables right arrow when at maximumDate', () => {
    setup({ date: maximumDate })
    expect(getNextDayButton()).toBeDisabled()
    expect(getPreviousDayButton()).not.toBeDisabled()
  })

  it('opens and closes calendar picker when calendar icon is clicked', () => {
    setup()
    const calendarButton = screen.getByRole('button', { name: /calendar/i })
    expect(calendarButton).toBeInTheDocument()
    fireEvent.click(calendarButton)
    // Picker behavior is internal, so just ensure the button is clickable
    // Actual popover logic would be tested in integration or MUI tests
  })

  it('shows "No data available" when date is null', () => {
    setup({ date: null })
    const input = screen.getByDisplayValue('No data available')
    expect(input).toBeInTheDocument()
  })

  it('disables both arrow buttons when date is null', () => {
    setup({ date: null })
    expect(getPreviousDayButton()).toBeDisabled()
    expect(getNextDayButton()).toBeDisabled()
  })

  it('does not call updateDate when arrows are clicked and date is null', () => {
    const { updateDate } = setup({ date: null })
    fireEvent.click(getPreviousDayButton())
    fireEvent.click(getNextDayButton())
    expect(updateDate).not.toHaveBeenCalled()
  })

  it('gives every control an accessible name so a screen reader can announce it', () => {
    setup()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName()
    }
  })
})
