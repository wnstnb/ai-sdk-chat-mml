# User Preferences Guide

The Preferences modal allows you to customize your experience with the application. Access it through the settings menu or keyboard shortcut.

## Accessing Preferences

- Click the **Settings** icon in the main interface
- Use the keyboard shortcut (if available)
- The preferences modal will open with tabbed navigation

## General Preferences

The General tab contains core application settings that affect the overall behavior and appearance.

### Theme

**Purpose**: Controls the visual appearance of the application

**Options**:
- **Light**: Bright theme with dark text on light backgrounds
- **Dark**: Dark theme with light text on dark backgrounds (default)

**How it works**: The theme setting is applied immediately when changed and affects all parts of the application interface.

### Default Model

**Purpose**: Sets which AI model to use when starting new conversations

**Options**: Various AI models are available depending on your subscription:
- GPT-4 variants
- Claude models  
- Other supported models

**How it works**: This setting only applies to new conversations. Existing conversations will continue using their originally selected model.

### Manage Subscription

**Purpose**: Access billing and subscription management

**Features**:
- View current subscription status
- Access billing history
- Update payment methods
- Change subscription plans
- View trial information

**Billing Information Display**:
- **Email**: Account email address
- **Billing Cycle**: Monthly/yearly billing frequency
- **Trial Ends**: End date of trial period (if applicable)
- **Subscription End**: Next billing date or subscription end date
- **Status**: Current subscription status (active, trial, cancelled, etc.)

**Actions**:
- Click **Manage Plan** to open the Stripe customer portal in a new tab
- View detailed billing information in the information card

## Style Preferences

The Style tab contains visual and interaction customization options.

### Font Sizes

**Purpose**: Adjust text size for different areas of the application

**Editor Font Size**:
- **Range**: 0.5 to 3.0 rem
- **Default**: 1.0 rem
- **Affects**: Text size in the main editor/document area
- **Units**: rem (relative to browser's base font size)

**Chat Font Size**:
- **Range**: 0.5 to 3.0 rem  
- **Default**: 1.0 rem
- **Affects**: Text size in chat messages and AI responses
- **Units**: rem (relative to browser's base font size)

**Tips**:
- Use smaller values (0.8-0.9) for more compact text
- Use larger values (1.2-1.5) for better readability
- Changes apply immediately as you type

### AI Interactions

Comprehensive settings for AI-powered features and visual feedback.

#### AI Highlighting

**Purpose**: Controls how the AI highlights and emphasizes content

**Enable AI Highlighting**:
- **Default**: On
- **Effect**: Enables/disables all AI highlighting features

**Highlight Duration**:
- **3 seconds**: Highlights fade out after 3 seconds
- **5 seconds**: Highlights fade out after 5 seconds  
- **10 seconds**: Highlights fade out after 10 seconds
- **Default**: 5 seconds
- **Effect**: How long highlights remain visible after AI actions

**Show Diff Indicators**:
- **Default**: On
- **Effect**: Shows visual indicators for AI-made changes and additions

**Scroll to Highlighted Content**:
- **Default**: On
- **Effect**: Automatically scrolls to show highlighted content when AI makes changes

**Custom Highlight Colors**:
- **Default**: Off
- **Effect**: When enabled, uses custom color scheme for highlights
- **Colors**: Predefined alternate color palette for highlights

#### Toast Notifications

**Purpose**: Controls AI action notifications and feedback

**Enable Toast Notifications**:
- **Default**: On
- **Effect**: Shows/hides popup notifications for AI actions

**Notification Style**:
- **Compact**: Minimal notifications with essential information
- **Detailed**: Full notifications with additional context and actions
- **Default**: Detailed

**Animation Speed**:
- **Slow**: Longer, more gentle animations
- **Normal**: Standard animation timing
- **Fast**: Quick, snappy animations
- **Default**: Normal

**Notification Position**:
- **Top Right**: Notifications appear in upper right corner
- **Top Left**: Notifications appear in upper left corner  
- **Bottom Right**: Notifications appear in lower right corner
- **Bottom Left**: Notifications appear in lower left corner
- **Default**: Top Right

**Show Retry Button**:
- **Default**: On
- **Effect**: Shows retry button in notifications when AI actions fail

#### Message Pane Defaults

**Purpose**: Controls the default behavior of the AI message pane

**Default State**:
- **Collapsed**: Message pane starts minimized
- **Expanded**: Message pane starts open
- **Default**: Collapsed

**Remember Last State**:
- **Default**: On
- **Effect**: When enabled, remembers whether you had the message pane open or closed
- **Behavior**: Overrides the default state setting with your last preference
- **Storage**: Preference is saved locally in your browser

## Tips and Best Practices

### Performance Considerations

- **Font Sizes**: Very large font sizes may affect performance with large documents
- **Highlighting**: Disabling highlighting can improve performance on slower devices
- **Notifications**: Compact style uses fewer resources than detailed notifications

### Accessibility

- **Font Sizes**: Increase font sizes for better readability
- **Highlighting**: Disable if motion sensitivity is a concern
- **Notifications**: Adjust position based on your screen reader preferences

### Workflow Optimization

- **Message Pane**: Set default state based on your typical usage pattern
- **Highlighting Duration**: Longer durations help track AI changes; shorter durations reduce visual clutter
- **Notifications**: Disable if you prefer a distraction-free environment

## Saving and Applying Changes

- **Automatic Saving**: All preference changes are saved automatically
- **Immediate Effect**: Most changes apply instantly without requiring a page refresh
- **Persistence**: Preferences are saved to your user profile and sync across devices
- **Reset**: Contact support if you need to reset preferences to defaults

## Troubleshooting

### Changes Not Applying

1. Refresh the page
2. Check that you're logged in to your account
3. Verify your browser allows local storage
4. Clear browser cache if issues persist

### Performance Issues

1. Reduce font sizes if text rendering is slow
2. Disable AI highlighting on slower devices
3. Use compact notification style
4. Consider disabling animations

### Billing Issues

1. Use the "Manage Plan" button to access the billing portal
2. Check your email for billing notifications
3. Contact support if billing information appears incorrect
4. Ensure your browser allows popup windows for the billing portal

## Privacy and Data

- **Local Storage**: Some preferences (like message pane state) are stored locally in your browser
- **Profile Storage**: Account-level preferences are stored securely in your user profile
- **No Tracking**: Preference data is not used for analytics or tracking purposes
- **Data Portability**: Preferences can be exported/imported (contact support for assistance) 