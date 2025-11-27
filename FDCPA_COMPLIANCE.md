# FDCPA Compliance Guide

This document outlines how Reluit ensures compliance with the Fair Debt Collection Practices Act (FDCPA).

## Overview

The FDCPA is a federal law that protects consumers from abusive, deceptive, and unfair debt collection practices. Reluit is designed to be fully FDCPA compliant.

## Key FDCPA Requirements Implemented

### 1. Mini-Miranda Disclosure

**Requirement**: All collection communications must include the Mini-Miranda disclosure.

**Implementation**:
- Automatically added to every collection email footer
- Text: "This is an attempt to collect a debt and any information obtained will be used for that purpose."

**Location**: `src/lib/fdcpa/compliance.ts` - `getMiniMirandaDisclosure()`

### 2. Validation Notice

**Requirement**: Within 5 days of initial communication, consumers must receive a validation notice with:
- Amount of debt
- Creditor name
- Right to dispute (30 days)
- Right to request verification

**Implementation**:
- Automatically included in first contact emails
- Contains all required information
- Provides clear instructions for disputing

**Location**: `src/lib/fdcpa/compliance.ts` - `getValidationNotice()`

### 3. Time Restrictions

**Requirement**: Debt collectors cannot contact consumers:
- Before 8:00 AM
- After 9:00 PM (in consumer's timezone)

**Implementation**:
- All emails scheduled only between 8 AM - 9 PM
- Automatic scheduling adjustment if outside compliant hours
- Timezone-aware scheduling

**Location**: 
- `src/lib/fdcpa/compliance.ts` - `isCompliantTime()`, `getNextCompliantTime()`
- `src/lib/ai-agent/tools.ts` - Time checks before sending

### 4. Stop Contact Requests

**Requirement**: If consumer requests to stop contact, collector must comply (except to notify of specific actions).

**Implementation**:
- Automatic detection of "STOP" requests in email replies
- Immediate campaign pause
- Customer preference stored in database
- All future emails blocked for that customer

**Location**: `src/app/api/webhooks/resend/inbound/route.ts` - STOP request handling

### 5. Prohibited Practices

**Requirement**: Cannot use:
- Harassing or abusive language
- False or misleading representations
- Threats of violence or criminal action
- Unfair practices

**Implementation**:
- AI prompt explicitly prohibits threatening language
- Content validation checks for prohibited phrases
- Professional tone enforced at all times
- No false representations about debt amount or legal status

**Location**: 
- `src/lib/gemini/client.ts` - AI prompt restrictions
- `src/lib/fdcpa/compliance.ts` - `validateFDCPACompliance()`

### 6. Accurate Debt Information

**Requirement**: Must accurately represent:
- Debt amount
- Creditor information
- Legal status

**Implementation**:
- All debt amounts pulled directly from invoice data
- Creditor name from organization settings
- No false claims about legal status
- Clear invoice identification

### 7. Consumer Rights Disclosure

**Requirement**: Must inform consumers of their rights:
- Right to dispute debt
- Right to request verification
- Right to request original creditor information

**Implementation**:
- Included in validation notice
- Clear instructions provided
- Easy opt-out mechanism

## Email Footer Requirements

Every collection email includes:

1. **Mini-Miranda Disclosure**
2. **Stop Contact Instructions**: "Reply with 'STOP' to stop contact"
3. **Debt Information**:
   - Creditor name
   - Debt amount
   - Invoice number
4. **Contact Information**: Organization address and phone (if provided)
5. **Debt Collector Statement**: "This communication is from a debt collector"

## Compliance Checks

### Automatic Checks

1. **Time Compliance**: Emails only sent 8 AM - 9 PM
2. **Stop Requests**: Automatically honored
3. **Content Validation**: Prohibited language detection
4. **Disclosure Inclusion**: Required disclosures always included

### Manual Review Triggers

The system flags for human review:
- Customer disputes
- Financial hardship claims
- Complex situations
- 60+ days overdue with no response

## Record Keeping

All communications are logged with:
- Timestamp
- Content
- FDCPA compliance status
- Consumer response (if any)
- Stop request status

## Consumer Rights

Consumers can:
1. **Dispute the debt** - Reply to email or contact directly
2. **Request verification** - Automatic handling
3. **Request original creditor** - Provided within 30 days
4. **Stop contact** - Reply with "STOP"
5. **Opt out** - Clear instructions provided

## State-Specific Compliance

**Note**: FDCPA is federal law. Some states have additional requirements:
- California: Rosenthal Fair Debt Collection Practices Act
- New York: Additional disclosure requirements
- Texas: Specific time restrictions

**Recommendation**: Review state-specific requirements for your jurisdiction.

## Best Practices

1. **Always include disclosures** - Automatically handled
2. **Respect time restrictions** - Automatically enforced
3. **Honor stop requests** - Automatically processed
4. **Maintain accurate records** - All logged automatically
5. **Professional communication** - AI enforces professional tone
6. **Clear debt information** - Always accurate and clear

## Compliance Monitoring

The system tracks:
- Email send times (must be 8 AM - 9 PM)
- Disclosure inclusion (always included)
- Stop request compliance (automatically honored)
- Content compliance (validated before sending)

## Testing Compliance

To verify compliance:
1. Check email footers include all required disclosures
2. Verify emails only sent during compliant hours
3. Test STOP request handling
4. Review email content for prohibited language
5. Confirm validation notices sent on first contact

## Legal Disclaimer

This compliance guide is for informational purposes only and does not constitute legal advice. Consult with legal counsel to ensure full compliance with FDCPA and applicable state laws.

## Updates

FDCPA compliance is continuously monitored and updated. All changes are documented and tested before deployment.

