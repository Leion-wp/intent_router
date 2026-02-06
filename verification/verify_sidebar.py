from playwright.sync_api import sync_playwright, expect

def test_sidebar_accessibility(page):
    # 1. Arrange: Go to the app and inject data
    page.goto("http://localhost:5173/")

    # 2. Verify Tab Structure
    # Check tabs exist
    expect(page.locator('#tab-providers')).to_be_visible()
    expect(page.locator('#tab-history')).to_be_visible()
    expect(page.locator('#tab-environment')).to_be_visible()

    # Check Panels exist (initially 'providers' is active)
    expect(page.locator('#panel-providers')).to_be_visible()

    # Check ARIA roles on active panel
    panel = page.locator('#panel-providers')
    expect(panel).to_have_attribute("role", "tabpanel")
    expect(panel).to_have_attribute("aria-labelledby", "tab-providers")

    # Check list role
    list_container = panel.locator('[role="list"]')
    expect(list_container).to_be_visible()

    # Verify Providers Items have role="listitem" (NEW CHECK)
    provider_items = list_container.locator('[role="listitem"]')
    # Based on Sidebar.tsx, there are 7 items (3 context + 4 providers)
    expect(provider_items).to_have_count(7)

    # 3. Switch to History Tab
    page.click('#tab-history')

    # Verify History Panel
    history_panel = page.locator('#panel-history')
    expect(history_panel).to_be_visible()
    expect(history_panel).to_have_attribute("role", "tabpanel")

    # Verify History Items
    items = history_panel.locator('[role="listitem"]')
    expect(items).to_have_count(2)

    # Check tabIndex on item
    first_item = items.first
    expect(first_item).to_have_attribute("tabindex", "0")

    # 4. Screenshot
    page.screenshot(path="verification/sidebar_verification.png")
    print("Verification successful!")

    browser.close()

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create context with init script
        context = browser.new_context()
        context.add_init_script("""
            window.initialData = {
                history: [
                    { id: '1', name: 'Test Run 1', timestamp: Date.now(), status: 'success', pipelineSnapshot: {} },
                    { id: '2', name: 'Test Run 2', timestamp: Date.now(), status: 'failure' }
                ],
                environment: {
                    MY_VAR: 'test_value'
                }
            };
            window.vscode = {
                postMessage: (msg) => console.log('VSCode Message:', msg)
            };
        """)

        page = context.new_page()
        test_sidebar_accessibility(page)

if __name__ == "__main__":
    run()
