const { test, expect } = require('@playwright/test');

// Configuration for local test environment
const APP_URL = 'http://localhost:8000/?mock=true';

test.describe('GoGo Poker Chip Exchange Game Flow', () => {
  
  test('Complete game flow: Register, Create Room, Exchange Chips, Approve & Finish', async ({ page, context }) => {
    // 1. Navigate to the App in Mock mode
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));
    await page.goto(APP_URL);
    
    // 2. Perform Mock Google Login
    const loginButton = page.locator('#btn-google-login');
    await expect(loginButton).toBeVisible();
    await loginButton.click();
    
    // 3. Set Display Name (First login setup)
    await page.waitForSelector('#view-profile-setup');
    await page.fill('#setup-display-name', 'Admin Player');
    await page.click('#btn-save-profile');
    
    // 4. Create Room
    await page.waitForSelector('#view-room-selection');
    await page.click('#btn-create-room');
    
    // Wait for the game dashboard to appear
    await page.waitForSelector('#game-view');
    const roomId = await page.locator('#display-room-id').textContent();
    console.log(`Created Room ID: ${roomId}`);
    expect(roomId).not.toBe('------');
    
    // As the creator, we start in the admin view. Click the Player tab.
    await page.click('#view-player');
    await expect(page.locator('#player-view')).toBeVisible();
    await expect(page.locator('#player-name-display')).toContainText('Admin Player');
    
    // 5. Select Chips and Request Exchange (Buy)
    // Select 2 x 10 THB chips
    await page.click('#player-chip-selection .chip-row:has-text("10 THB") .counter-btn:has-text("+")');
    await page.click('#player-chip-selection .chip-row:has-text("10 THB") .counter-btn:has-text("+")');
    
    // Select 1 x 50 THB chip
    await page.click('#player-chip-selection .chip-row:has-text("50 THB") .counter-btn:has-text("+")');
    
    // Check that total displays 70 THB
    const cartTotal = await page.locator('#player-cart-total').textContent();
    expect(cartTotal).toBe('70 THB');
    
    // Execute Buy (request transaction)
    await page.click('#btn-execute-buy');
    
    // Verify transaction appears in player history as PENDING
    await page.waitForSelector('#player-history .badge-pending');
    const historyItem = page.locator('#player-history').locator('div.stack.animate-in').first();
    await expect(historyItem).toContainText('PENDING');
    await expect(historyItem).toContainText('70 THB');
    
    // 6. Switch to Approvals View (Admin menu)
    // First, verify admin navigation bar is visible since we are the room owner
    await expect(page.locator('#admin-toggle-bar')).toBeVisible();
    await page.click('#view-admin');
    
    // Verify Pending Approvals dashboard is visible
    await expect(page.locator('#admin-view')).toBeVisible();
    await expect(page.locator('#admin-pending-list')).toContainText('Admin Player');
    await expect(page.locator('#admin-pending-list')).toContainText('50 THB x1');
    
    // Approve the request
    await page.click('#admin-pending-list .btn-approve');
    
    // 7. Verify updated balance
    await page.click('#view-player');
    await expect(page.locator('#player-balance')).toContainText('70');
    
    // 8. Test Settings Modal & "X" Close Button
    // Click profile dropdown trigger
    await page.click('#profile-menu-trigger');
    await expect(page.locator('#profile-dropdown-menu')).toBeVisible();
    
    // Click Settings
    await page.click('#btn-menu-settings');
    await expect(page.locator('#modal-backdrop')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('Room Settings');
    
    // Change Display Name and update
    await page.fill('#new-display-name', 'Updated Name');
    await page.click('#btn-update-name');
    
    // Verify displayName is updated on page
    await expect(page.locator('#player-name-display')).toContainText('Updated Name');
    
    // Reopen Settings to test "X" button
    await page.click('#profile-menu-trigger');
    await page.click('#btn-menu-settings');
    await expect(page.locator('#modal-backdrop')).toBeVisible();
    
    // Click the "X" button in top-right
    await page.click('#modal-cancel');
    await expect(page.locator('#modal-backdrop')).not.toBeVisible();
    
    // 8.5 Return Chips to balance the pool
    await page.click('#view-player');
    
    // Select the chips to return (1 black, 2 green)
    await page.click('#player-chip-selection .chip-row:has-text("10 THB") .counter-btn:has-text("+")');
    await page.click('#player-chip-selection .chip-row:has-text("10 THB") .counter-btn:has-text("+")');
    await page.click('#player-chip-selection .chip-row:has-text("50 THB") .counter-btn:has-text("+")');
    
    await expect(page.locator('#player-cart-total')).toContainText('70 THB');
    
    await page.click('#btn-execute-sell');
    await page.waitForSelector('#player-history .badge-pending');
    
    await page.click('#view-admin');
    await page.waitForTimeout(200); // Give UI time to render
    await page.click('#admin-pending-list .btn-approve');
    await page.waitForTimeout(500); // Wait for the approval to process
    
    // Verify room status now shows BALANCED
    await page.click('#view-room');
    await expect(page.locator('#room-view')).toBeVisible();
    await expect(page.locator('#reconcile-status')).toContainText('BALANCED');
    
    const finishGameButton = page.locator('#btn-finish-game');
    await expect(finishGameButton).toBeEnabled({ timeout: 5000 });
    await finishGameButton.click();
    
    // Verify confirmation modal opens
    await expect(page.locator('#modal-backdrop')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('Finish Game');
    
    // Click OK on confirmation
    await page.click('#modal-ok');
    
    // Verify standing summary modal opens
    await expect(page.locator('#modal-backdrop')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('Game Standing Summary');
    
    // Close the summary modal using the "X" button
    await page.click('#modal-cancel');
    await expect(page.locator('#modal-backdrop')).not.toBeVisible();
  });
});
