from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mock initial data
    mock_history = [
        {
            "id": "run_1",
            "name": "Test Run 1",
            "timestamp": 1678886400000,
            "status": "success",
            "steps": []
        },
        {
            "id": "run_2",
            "name": "Test Run 2",
            "timestamp": 1678890000000,
            "status": "failure",
            "steps": []
        }
    ]

    # Inject data before loading
    page.add_init_script(f"""
        window.initialData = {{
            history: {str(mock_history)},
            commandGroups: []
        }};
    """)

    page.goto("http://localhost:5173/")

    # Wait for Sidebar to load
    # Verify Tabs
    providers_tab = page.get_by_role("tab", name="PROVIDERS")
    history_tab = page.get_by_role("tab", name="HISTORY")

    expect(providers_tab).to_be_visible()
    expect(history_tab).to_be_visible()

    # Verify attributes
    expect(providers_tab).to_have_attribute("aria-selected", "true")
    expect(history_tab).to_have_attribute("aria-selected", "false")

    # Click History Tab
    history_tab.click()

    # Verify tab switch
    expect(history_tab).to_have_attribute("aria-selected", "true")
    expect(providers_tab).to_have_attribute("aria-selected", "false")

    # Verify History Items
    # They should be accessible as buttons now
    # Wait for items to be visible
    page.wait_for_selector(".history-item")

    # Check that they are buttons (this confirms my change from div to button)
    # Note: get_by_role("button") should find them.
    # The first one should contain "Test Run 1"
    run1_btn = page.get_by_role("button").filter(has_text="Test Run 1")
    expect(run1_btn).to_be_visible()

    # Take screenshot
    page.screenshot(path="verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
