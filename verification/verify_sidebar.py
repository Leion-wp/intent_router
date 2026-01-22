import time
from playwright.sync_api import sync_playwright
import os

def test_sidebar_appearance():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Read the local codicon CSS
        with open('media/codicons/codicon.css', 'r') as f:
            codicon_css = f.read()

        # Update font path in CSS to be absolute or base64 for the test
        # Since we are in a headless browser test, we might need to handle the font file loading.
        # But for just seeing the class styles applied (and maybe missing font boxes), it's a start.
        # Ideally we serve the directory.

        # Inject VS Code theme variables + Codicon CSS
        vscode_css = """
        :root {
            --vscode-sideBar-background: #252526;
            --vscode-sideBar-foreground: #cccccc;
            --vscode-panel-border: #80808059;
            --vscode-dropdown-background: #3c3c3c;
            --vscode-dropdown-foreground: #f0f0f0;
            --vscode-dropdown-border: #3c3c3c;
            --vscode-font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            --vscode-font-size: 13px;
        }
        body {
            background-color: #1e1e1e;
            color: #cccccc;
        }
        """

        # Go to the local dev server
        page.goto("http://localhost:5173")

        # Inject the CSS
        page.add_style_tag(content=vscode_css)

        # Inject Codicon CSS
        # We need to make sure the font path is valid.
        # For this test, let's just inject the CSS and see if the classes are applied.
        page.add_style_tag(content=codicon_css)

        # Wait for sidebar to render
        page.wait_for_selector("aside")

        # Take screenshot of the sidebar
        sidebar = page.locator("aside")
        sidebar.screenshot(path="verification/sidebar_test.png")

        browser.close()

if __name__ == "__main__":
    test_sidebar_appearance()
