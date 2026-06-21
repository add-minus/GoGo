# Testing GoGo locally (Mock Mode)

To allow offline testing and bypass Google Authentication security blocklists without requiring Java or Firebase Emulators installed on your machine, we have built a **Mock Mode** using client-side database simulation in `localStorage`.

---

## Prerequisite Setup

Ensure you have Playwright installed:
```bash
npm install -D @playwright/test
```

---

## Running the Automated Tests

Simply execute Playwright. Playwright will automatically serve the app locally and run the tests against the mock-enabled URL (`http://localhost:8000/?mock=true`):

```bash
npx playwright test
```

### Running Tests in UI Interactive Mode
To watch the browser navigate and execute the actions step-by-step:
```bash
npx playwright test --ui
```

---

## Testing Manually in the Browser

You can also run through the mock flow manually in your browser:
1. Start a local server:
   ```bash
   npx serve .
   ```
2. Navigate to: **`http://localhost:8000/?mock=true`**
3. Click **Sign in with Google**. It will automatically log you in as a mock user, allowing you to create rooms, join, exchange chips, approve transactions, edit settings, and finish games locally with full data persistence inside your browser's LocalStorage.

---

## Test Cases Covered in `tests.spec.js`

1. **Mock Sign-In**: Bypasses Google authentication and signs in automatically.
2. **First-Login Profile Setup**: Enters a display name and registers the user.
3. **Room Creation**: Generates a valid room code and displays the game dashboard.
4. **Chip Exchange Request (Buy)**: Selects chips, validates totals, and submits the transaction.
5. **Admin Approval Loop**: Navigates to the approvals dashboard, finds the transaction, and approves it.
6. **Balance Updates**: Verifies the player balance updates to reflect approved chips.
7. **Profile Settings & "X" Close Button**:
   - Opens settings, changes the display name, and validates the change.
   - Reopens settings and closes the modal using the top-right **"X"** button.
8. **End-to-End Game Finish**: Ends the game, checks standings, and returns to the home screen.
