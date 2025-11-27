'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import { resetPassword } from '@/lib/actions/auth'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    try {
      const result = await resetPassword(formData)
      if (result?.error) {
        toast.error(result.error)
      } else if (result?.success) {
        setEmailSent(true)
        toast.success(result.message)
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (emailSent) {
    return (
      <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
          <CardDescription className="text-muted-foreground">
            We&apos;ve sent you a password reset link. Click the link in the email to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Button asChild variant="outline" className="w-full h-11">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="space-y-1 text-center pb-2">
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Forgot password?</CardTitle>
        <CardDescription className="text-muted-foreground">
          No worries, we&apos;ll send you reset instructions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              autoComplete="email"
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 font-medium"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending link...
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
        </form>

        <Button asChild variant="ghost" className="w-full h-11">
          <Link href="/login">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to login
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

