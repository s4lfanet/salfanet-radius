import { prisma } from '@/server/db/client'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

/**
 * POST /api/admin/pppoe/users/[id]/deposit
 * Top up user balance (deposit)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Update balance
    const updatedUser = await prisma.pppoeUser.update({
      where: { id },
      data: {
        balance: {
          increment: amount
        }
      }
    })

    // Get or create deposit transaction category
    let depositCategory = await prisma.transactionCategory.findFirst({
      where: { name: 'Deposit Saldo' }
    })

    if (!depositCategory) {
      depositCategory = await prisma.transactionCategory.create({
        data: {
          id: nanoid(),
          name: 'Deposit Saldo',
          type: 'INCOME',
          description: 'Top up saldo user'
        }
      })
    }

    // Create transaction record
    await prisma.transaction.create({
      data: {
        id: nanoid(),
        categoryId: depositCategory.id,
        amount: amount,
        type: 'INCOME',
        description: note || `Top up saldo deposit untuk user ${user.username}`,
        reference: `DEPOSIT-${id}`, // Store user ID in reference field
        notes: paymentMethod ? `Payment Method: ${paymentMethod}` : 'Payment Method: MANUAL',
        createdAt: new Date(),
        createdBy: 'admin', // TODO: Get from session
      }
    })

    console.log(`[Deposit] User ${user.username} balance +${amount}. New balance: ${updatedUser.balance}`)

    return NextResponse.json({
      message: 'Top up berhasil',
      data: {
        username: user.username,
        previousBalance: user.balance,
        amount: amount,
        newBalance: updatedUser.balance,
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
