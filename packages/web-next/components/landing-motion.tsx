"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { m, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

const MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LandingRevealProps = {
  children?: ReactNode
  className?: string
  delay?: number
  duration?: number
  x?: number
  y?: number
  scale?: number
  amount?: number
  once?: boolean
}

export function LandingReveal({
  children,
  className,
  delay = 0,
  duration = 0.62,
  x = 0,
  y = 24,
  scale = 1,
  amount = 0.12,
  once = true,
}: LandingRevealProps) {
  const shouldReduceMotion = useReducedMotion()
  // Fail-safe: whileInView can miss on fast scrolls / snap containers and
  // leave content stuck at opacity 0 (founder bug report 2026-09-30). After
  // 2.5s everything is forced visible — content must never stay hidden.
  const [forceVisible, setForceVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setForceVisible(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  const visible = { opacity: 1, x: 0, y: 0, scale: 1 }
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, x, y, scale }}
      animate={forceVisible ? visible : undefined}
      whileInView={forceVisible ? undefined : visible}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: MOTION_EASE }}
    >
      {children}
    </m.div>
  )
}

type LandingStaggerProps = {
  children?: ReactNode
  className?: string
  delay?: number
  stagger?: number
  amount?: number
  once?: boolean
}

export function LandingStagger({
  children,
  className,
  delay = 0,
  stagger = 0.08,
  amount = 0.28,
  once = true,
}: LandingStaggerProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
      variants={{
        hidden: {},
        show: {
          transition: {
            delayChildren: delay,
            staggerChildren: stagger,
          },
        },
      }}
    >
      {children}
    </m.div>
  )
}

type LandingStaggerItemProps = {
  children?: ReactNode
  className?: string
  duration?: number
  x?: number
  y?: number
  scale?: number
}

export function LandingStaggerItem({
  children,
  className,
  duration = 0.56,
  x = 0,
  y = 20,
  scale = 0.985,
}: LandingStaggerItemProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={cn(className)}>{children}</div>
  }

  return (
    <m.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, x, y, scale },
        show: {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          transition: { duration, ease: MOTION_EASE },
        },
      }}
    >
      {children}
    </m.div>
  )
}
