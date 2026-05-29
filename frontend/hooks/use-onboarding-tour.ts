'use client'
import type { DriveStep } from 'driver.js'

const HOME_STEPS: DriveStep[] = [
  {
    element: '#tour-left-panel',
    popover: {
      title: 'Your Decisions',
      description: 'All your active and past decision threads live here. Switch between them or start a new one.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-start-btn',
    popover: {
      title: 'Start Here',
      description: "Click this to begin a new structured decision. You'll move through Clarify → Pressure-Test → Decision Output.",
      side: 'top',
      align: 'center',
    },
  },
]

const CLARIFY_STEPS: DriveStep[] = [
  {
    element: '#tour-clarify-title',
    popover: {
      title: 'Decision Title',
      description: 'Name what you are deciding. Be specific — a vague title leads to vague thinking.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-clarify-problem',
    popover: {
      title: 'Core Problem',
      description: "What's really going on here? Dig deeper than the surface — the real problem is usually one level below the obvious one.",
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-clarify-context',
    popover: {
      title: 'Context',
      description: 'Any background that shapes this decision — team size, past attempts, market conditions. Optional but powerful.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#tour-clarify-constraints',
    popover: {
      title: 'Constraints',
      description: 'What limits your options? Budget, time, team, regulations. Being honest here prevents false solutions.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#tour-clarify-assumptions',
    popover: {
      title: 'Assumptions',
      description: "What are you taking for granted? Listing assumptions is how you find your blind spots before they find you.",
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#tour-right-panel',
    popover: {
      title: 'Kautilya — Your AI Advisor',
      description: 'As you fill in the form, Kautilya analyses your thinking in real-time and surfaces patterns, risks, and blind spots.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#tour-clarify-continue',
    popover: {
      title: 'Continue',
      description: 'When you are ready, hit Continue. This saves your draft and moves you to the Pressure-Test stage.',
      side: 'top',
      align: 'end',
    },
  },
]

const PRESSURE_TEST_STEPS: DriveStep[] = [
  {
    element: '#tour-pt-progress',
    popover: {
      title: 'Progress',
      description: "You'll go through 3–5 scenarios. Each one stress-tests a different angle of your decision.",
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tour-pt-scenario',
    popover: {
      title: 'The Scenario',
      description: 'A hypothetical situation designed to challenge your decision. Read it carefully — it is testing your assumptions.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-pt-answer',
    popover: {
      title: 'Your Answer',
      description: 'Respond honestly, not optimistically. The system learns from how you reason, not just what you decide.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-pt-hints',
    popover: {
      title: 'Think About',
      description: 'These are angles to consider as you write your answer. They help you avoid tunnel vision.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#tour-pt-actions',
    popover: {
      title: 'Skip or Submit',
      description: 'Skip if the scenario is truly irrelevant. Submit when your answer reflects real reasoning.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-right-panel',
    popover: {
      title: 'Live Analysis',
      description: 'Kautilya reads your answers as you go and surfaces patterns, contradictions, and risk signals.',
      side: 'left',
      align: 'start',
    },
  },
]

export function startTour(view: string) {
  const steps = view === 'clarify' ? CLARIFY_STEPS : view === 'pressure-test' ? PRESSURE_TEST_STEPS : HOME_STEPS
  const firstEl = steps[0].element as string
  if (!document.querySelector(firstEl)) return

  import('driver.js').then(({ driver }) => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      stagePadding: 8,
      popoverClass: 'eidoz-tour-popover',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Got it',
      onDestroyStarted: () => { driverObj.destroy() },
      steps,
    })
    driverObj.drive()
  })
}
