# How to Add Your NILGuard Logo

## Step 1: Place Your Logo
1. Save your `logo.png` file in the `frontend/src/assets/` folder
2. Your logo file should be named exactly: `logo.png`

## Step 2: Logo Recommendations
- **Format:** PNG with transparent background
- **Size:** Recommended 200px width (will auto-scale)
- **Aspect Ratio:** Wide format (similar to your current logo)

## Step 3: File Structure
```
frontend/src/
├── assets/
│   └── logo.png          (← Place your logo here)
├── pages/
│   ├── LoginPage.js
│   └── RegisterPage.js
└── ...
```

## Pages Created

### 1. **Login Page** (`/login`)
- Email or NCAA ID input
- Password input
- Submit button
- Links to Register and Forgot Password

### 2. **Register Page** (`/register`)
- Email input
- Password input
- Confirm Password input
- Submit button
- Link back to login

## Styling Features

Both pages include:
- ✅ Clean, modern design matching your branding
- ✅ Dark inputs with gray background (#e8e8e8)
- ✅ Dark submit buttons (#2d2d2d)
- ✅ Orange accent colors (#ff9900)
- ✅ Decorative sports equipment footer (SVG)
- ✅ Fully responsive mobile design
- ✅ Hover effects on inputs and buttons

## Routes
- `http://localhost:3000/` → Login Page (default)
- `http://localhost:3000/login` → Login Page
- `http://localhost:3000/register` → Register Page
