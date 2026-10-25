# 🍞 Toast Notifications Guide

Guide untuk menggunakan toast notifications (popup notifications) di SALFANET RADIUS.

## 📋 Overview

Toast notifications adalah popup kecil yang muncul di pojok layar untuk memberikan feedback kepada user. Cocok untuk:
- ✅ Konfirmasi aksi berhasil (success)
- ❌ Error messages
- ⚠️ Warnings
- ℹ️ Info messages

## 🚀 Setup (Already Done)

Toast system sudah disetup di:
- ✅ `src/components/ui/toast.tsx` - Toast component
- ✅ `src/components/ui/toaster.tsx` - Toast container
- ✅ `src/components/ui/use-toast.ts` - Hook untuk trigger toast
- ✅ `src/app/layout.tsx` - Toaster added to root layout

## 📝 Usage Examples

### 1. Basic Success Toast

```typescript
import { useToast } from "@/components/ui/use-toast";

function MyComponent() {
  const { toast } = useToast();

  const handleSuccess = () => {
    toast({
      title: "Success!",
      description: "User created successfully",
    });
  };

  return <button onClick={handleSuccess}>Create User</button>;
}
```

### 2. Error Toast

```typescript
const handleError = () => {
  toast({
    variant: "destructive",
    title: "Error!",
    description: "Failed to create user",
  });
};
```

### 3. Custom Duration

```typescript
toast({
  title: "Auto-dismiss in 3 seconds",
  description: "This will disappear automatically",
  duration: 3000, // milliseconds
});
```

### 4. Toast with Action Button

```typescript
toast({
  title: "Scheduled: Catch up",
  description: "Friday, February 10, 2023 at 5:57 PM",
  action: (
    <button onClick={() => console.log('Undo')}>
      Undo
    </button>
  ),
});
```

### 5. Persistent Toast (Manual Dismiss)

```typescript
toast({
  title: "Important Notice",
  description: "Click X to close",
  duration: Infinity, // Won't auto-dismiss
});
```

## 🎨 Toast Variants

| Variant | Use Case | Example |
|---------|----------|---------|
| `default` | General info | User logged in |
| `destructive` | Errors, failures | Delete failed |
| Custom colors | Success, warning | Set custom className |

## 🔧 Common Use Cases

### API Success Response

```typescript
async function createUser(data: UserData) {
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.ok) {
      toast({
        title: "✅ User Created",
        description: "New user has been added successfully",
      });
    } else {
      throw new Error('Failed to create user');
    }
  } catch (error) {
    toast({
      variant: "destructive",
      title: "❌ Error",
      description: error.message,
    });
  }
}
```

### Form Submission

```typescript
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  
  toast({
    title: "⏳ Processing",
    description: "Please wait...",
    duration: 2000,
  });

  // Submit form...
  
  toast({
    title: "✅ Success",
    description: "Form submitted successfully",
  });
};
```

### Delete Confirmation

```typescript
const handleDelete = async (id: string) => {
  const result = await Swal.fire({
    title: 'Delete User?',
    text: 'This action cannot be undone',
    icon: 'warning',
    showCancelButton: true,
  });

  if (result.isConfirmed) {
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    
    toast({
      title: "🗑️ Deleted",
      description: "User has been removed",
    });
  }
};
```

## 📦 Integration with Existing Code

### Replace alert() with Toast

**Before:**
```typescript
alert('User created successfully!');
```

**After:**
```typescript
toast({
  title: "Success",
  description: "User created successfully!",
});
```

### Replace console.log() with Toast (for user feedback)

**Before:**
```typescript
console.log('Data saved');
```

**After:**
```typescript
toast({
  description: "Data saved",
});
```

## 🎯 Best Practices

### ✅ Do's
- Use for quick feedback (success/error)
- Keep messages short and clear
- Use appropriate variants (destructive for errors)
- Set reasonable duration (3-5 seconds)
- Show loading state for long operations

### ❌ Don'ts
- Don't use for critical errors (use modal instead)
- Don't show too many toasts at once
- Don't use for long messages (use dialog)
- Don't forget to handle errors
- Don't use for navigation confirmations

## 🔄 Migration from SweetAlert

SweetAlert masih digunakan untuk:
- ✅ Confirmation dialogs (delete, logout)
- ✅ Critical errors
- ✅ Long messages
- ✅ Input prompts

Toast digunakan untuk:
- ✅ Quick feedback
- ✅ Non-blocking notifications
- ✅ Success/error messages
- ✅ Status updates

## 🌐 Real-World Examples in SALFANET

### 1. User Management

```typescript
// src/app/admin/users/page.tsx
const handleCreateUser = async () => {
  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      toast({
        title: "✅ User Created",
        description: `${formData.username} has been added`,
      });
      refreshUsers();
    }
  } catch (error) {
    toast({
      variant: "destructive",
      title: "Failed to create user",
      description: error.message,
    });
  }
};
```

### 2. Invoice Generation

```typescript
const handleGenerateInvoices = async () => {
  toast({
    title: "⏳ Generating Invoices",
    description: "This may take a few moments...",
    duration: 2000,
  });

  const response = await fetch('/api/invoices/generate', {
    method: 'POST',
  });

  const data = await response.json();

  if (data.success) {
    toast({
      title: "✅ Invoices Generated",
      description: `${data.count} invoices created successfully`,
    });
  }
};
```

### 3. Payment Processing

```typescript
const handleApprovePayment = async (id: string) => {
  await fetch(`/api/manual-payments/${id}/approve`, {
    method: 'POST',
  });

  toast({
    title: "💰 Payment Approved",
    description: "User balance has been updated",
  });
  
  loadPayments();
};
```

## 🎨 Custom Styling

### Success Toast (Green)

```typescript
toast({
  title: "Success",
  description: "Operation completed",
  className: "bg-green-50 border-green-200 text-green-900",
});
```

### Warning Toast (Orange)

```typescript
toast({
  title: "Warning",
  description: "Please check your input",
  className: "bg-orange-50 border-orange-200 text-orange-900",
});
```

### Info Toast (Blue)

```typescript
toast({
  title: "Info",
  description: "New feature available",
  className: "bg-blue-50 border-blue-200 text-blue-900",
});
```

## 🔧 Advanced Usage

### Toast Queue

Multiple toasts will stack automatically:

```typescript
// Show multiple toasts in sequence
toast({ description: "Step 1 complete" });
setTimeout(() => toast({ description: "Step 2 complete" }), 1000);
setTimeout(() => toast({ description: "Step 3 complete" }), 2000);
```

### Programmatic Dismiss

```typescript
const { toast, dismiss } = useToast();

const showToast = () => {
  const { id } = toast({
    title: "Processing...",
    duration: Infinity,
  });

  // Dismiss after API call
  fetch('/api/data').then(() => {
    dismiss(id);
    toast({ title: "Done!" });
  });
};
```

## 📊 Comparison: Toast vs SweetAlert vs Notification

| Feature | Toast | SweetAlert | Notification Dropdown |
|---------|-------|------------|----------------------|
| **Use Case** | Quick feedback | Confirmations | Historical log |
| **Dismissal** | Auto | Manual | Manual |
| **Position** | Corner | Center | Dropdown |
| **Blocking** | No | Yes | No |
| **Duration** | 3-5s | Until closed | Permanent |
| **Best For** | Success/Error | Delete/Logout | Activity history |

## 🎯 Next Steps

1. **Replace existing alerts** - Gradually migrate from `alert()` to `toast()`
2. **Add to API routes** - Return toast-friendly messages from backend
3. **User feedback** - Add toasts for all user actions
4. **Loading states** - Show processing toasts for async operations

## 📚 Resources

- [Shadcn UI Toast Documentation](https://ui.shadcn.com/docs/components/toast)
- [React Hook Form Integration](https://react-hook-form.com/)
- SALFANET API Documentation

---

**Happy Toasting! 🍞✨**
