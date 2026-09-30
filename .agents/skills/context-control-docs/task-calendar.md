Source: app/docs/page.tsx (route: /docs?section=task-calendar)

Task Automation & Calendar · Section 05
# Task Calendar & BullMQ Deferred Queue
Visual calendar dashboard for deferred task scheduling backed by BullMQ Redis workers and AWS EventBridge target-time triggers.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Task Calendar** view provides a visual timeline and scheduling dashboard for deferred background agent tasks. Standard serverless web applications suffer from strict HTTP execution timeouts (10 to 60 seconds). The Task Calendar eliminates these limitations by offloading delayed agent jobs to a durable BullMQ Redis Queue and AWS EventBridge Target-Time Scheduler.
### 2. Key Capabilities & Architecture
* **Target-Time Countdown Triggers:** Enables tenants to schedule agent tasks to execute at exact future ISO 8601 timestamps (e.g. `at(2026-09-28T14:00:00Z)`). Single-use AWS EventBridge rules trigger background workers at the target time with zero idle compute costs.
* **BullMQ Redis Queue Durability:** Scheduled jobs are enqueued into BullMQ sorted sets and atomic Redis journals. If a worker container recycles or restarts, all scheduled executions survive without job loss.
* **Interactive Monthly & Weekly Calendar Timelines:** Visual calendar view displays upcoming scheduled tasks, active execution countdown timers, and historical task outcomes.
* **Fallback & Edge-Case Policy Matrix:** Every scheduled task incorporates a configurable fallback matrix. If a primary tool action bounces during execution, the queue engine automatically triggers secondary actions, retries, or voice call escalations.
### 3. Step-by-Step UI How-To-Use Guide
* Navigate to **Task Calendar** in the workspace sidebar.
* Toggle between the **Calendar View** (interactive monthly timeline) and **List View** (tabular job status table).
* Click **Schedule Deferred Task** to open the task creation modal.
* Specify the task title, operational instructions, target execution timestamp, and selected agent graph.
* Monitor execution countdowns and click any scheduled event card to inspect status or cancel execution.