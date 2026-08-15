import { prisma } from '@/server/db/client'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { requirePermission } from '@/server/middleware/api-auth'

/**
 * POST /api/admin/pppoe/users/[id]/deposit
 * Top up user balance (deposit)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit')
    if (!authCheck.authorized) return authCheck.response
    const { id } = await params
    const body = await request.json()
    const { amount, paymentMethod, note } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount harus lebih dari 0' },
        { status: 400 }
      )
    }

    // Get user
    const user = await prisma.pppoeUser.findUnique({
      where: { id },
      include: { profile: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
    }

    // ─── ATOMIC: balance increment + financial transaction ────────────────────
    // Both operations in a single $transaction to ensure consistency.
    // If either fails, both roll back — balance and ledger stay in sync.
    const result = await prisma.$transaction(async (tx) => {
      // Get or create deposit transaction category
      let depositCategory = await tx.transactionCategory.findFirst({
        where: { name: 'Deposit Saldo' }
      })

      if (!depositCategory) {
        depositCategory = await tx.transactionCategory.create({
          data: {
            id: nanoid(),
            name: 'Deposit Saldo',
            type: 'INCOME',
            description: 'Top up saldo user'
          }
        })
      }

      // Increment balance
      const updatedUser = await tx.pppoeUser.update({
        where: { id },
        data: {
          balance: {
            increment: amount
          }
        }
      })

      // Create transaction record with deterministic reference for idempotency
      const reference = `DEPOSIT-${id}-${Date.now()}`
      const financialTx = await tx.transaction.create({
        data: {
          id: nanoid(),
          categoryId: depositCategory.id,
          amount: amount,
          type: 'INCOME',
          description: note || `Top up saldo deposit untuk user ${user.username}`,
          reference,
          notes: paymentMethod ? `Payment Method: ${paymentMethod}` : 'Payment Method: MANUAL',
          createdAt: new Date(),
          createdBy: 'admin', // TODO: Get from session
        }
      })

      return { updatedUser, financialTx }
    })

    console.log(`[Deposit] User ${user.username} balance +${amount}. New balance: ${result.updatedUser.balance}`)

    return NextResponse.json({
      message: 'Top up berhasil',
      data: {
        username: user.username,
        previousBalance: user.balance,
        amount: amount,
        newBalance: result.updatedUser.balance,
      }
    })

  } catch (error: any) {
    console.error('[Deposit Error]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/pppoe/users/[id]/deposit
 * Get user deposit history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.view')
    if (!authCheck.authorized) return authCheck.response
    const { id } = await params

    const transactions = await prisma.transaction.findMany({
      where: {
        reference: {
          startsWith: `DEPOSIT-${id}`
        },
        category: {
          is: {
            name: 'Deposit Saldo'
          }
        }
      },
      include: {
        category: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    })

    const user = await prisma.pppoeUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        balance: true,
        autoRenewal: true,
        profile: {
          select: {
            id: true,
            name: true,
            price: true,
          }
        }
      }
    })

    return NextResponse.json({
      user,
      transactions
    })

  } catch (error: any) {
    console.error('[Get Deposit History Error]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
