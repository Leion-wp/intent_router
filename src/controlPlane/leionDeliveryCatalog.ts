import { z } from 'zod';
import {
    BillingIntervalSchema,
    PlanTierSchema,
    TriggerSourceSchema,
} from './contracts';

const NonEmptyStringSchema = z.string().trim().min(1);

export const DeliveryPlanSchema = z.object({
    key: PlanTierSchema,
    displayName: NonEmptyStringSchema,
    salesMotion: z.enum(['self_serve', 'assisted', 'sales_led']),
    priceEur: z.number().nonnegative().optional(),
    setupFeeEur: z.number().nonnegative().optional(),
    billingInterval: BillingIntervalSchema.optional(),
    repoLimit: z.number().int().positive().nullable(),
    workflowLimit: z.number().int().positive().nullable(),
    bySeat: z.literal(false),
    byoAiKeysRequired: z.boolean(),
    features: z.array(NonEmptyStringSchema).min(1)
});

export const DeliveryTemplateReferenceSchema = z.object({
    key: z.enum(['issue_to_pr', 'pr_review_fix', 'release_gate']),
    name: NonEmptyStringSchema,
    pipelinePath: NonEmptyStringSchema,
    humanApprovalStepId: NonEmptyStringSchema,
    defaultTriggerModes: z.array(TriggerSourceSchema).min(1),
    proofGoal: NonEmptyStringSchema
});

export const LeionDeliveryCatalogSchema = z.object({
    productKey: z.literal('leion-delivery'),
    controlPlaneName: z.literal('Leion Delivery Control Plane'),
    positioning: NonEmptyStringSchema,
    targetCustomers: z.array(NonEmptyStringSchema).min(1),
    defaultMarket: z.object({
        geographies: z.array(NonEmptyStringSchema).min(1),
        gitHosts: z.array(z.literal('github')).min(1)
    }),
    freeOffer: DeliveryPlanSchema,
    commercialModel: z.object({
        openCore: z.literal(true),
        seatBasedPricing: z.literal(false),
        absorbLlmCost: z.literal(false),
        foundingPilot: DeliveryPlanSchema,
        publicPlans: z.array(DeliveryPlanSchema).length(3)
    }),
    templates: z.array(DeliveryTemplateReferenceSchema).length(3),
    docs: z.object({
        landingPage: NonEmptyStringSchema,
        pricing: NonEmptyStringSchema,
        foundingPilot: NonEmptyStringSchema,
        securityFaq: NonEmptyStringSchema,
        onboardingChecklist: NonEmptyStringSchema,
        salesPlaybook: NonEmptyStringSchema,
        proofScript: NonEmptyStringSchema
    })
});

export type DeliveryPlan = z.infer<typeof DeliveryPlanSchema>;
export type DeliveryTemplateReference = z.infer<typeof DeliveryTemplateReferenceSchema>;
export type LeionDeliveryCatalog = z.infer<typeof LeionDeliveryCatalogSchema>;

export const LEION_DELIVERY_CATALOG: LeionDeliveryCatalog = {
    productKey: 'leion-delivery',
    controlPlaneName: 'Leion Delivery Control Plane',
    positioning: 'Governed AI delivery workflows for engineering teams that need reusable automation and explicit human approval.',
    targetCustomers: [
        'software agencies',
        'software factories',
        'small engineering teams with repeated GitHub delivery work'
    ],
    defaultMarket: {
        geographies: ['France', 'Europe'],
        gitHosts: ['github']
    },
    freeOffer: {
        key: 'free',
        displayName: 'Leion Roots Open Core',
        salesMotion: 'self_serve',
        billingInterval: 'monthly',
        repoLimit: null,
        workflowLimit: null,
        bySeat: false,
        byoAiKeysRequired: true,
        features: [
            'VS Code extension',
            'local pipeline builder',
            'local runtime execution',
            'open workflow JSON files'
        ]
    },
    commercialModel: {
        openCore: true,
        seatBasedPricing: false,
        absorbLlmCost: false,
        foundingPilot: {
            key: 'founding_pilot',
            displayName: 'Leion Delivery Founding Pilot',
            salesMotion: 'sales_led',
            priceEur: 1000,
            setupFeeEur: 4500,
            billingInterval: 'monthly',
            repoLimit: 5,
            workflowLimit: 3,
            bySeat: false,
            byoAiKeysRequired: true,
            features: [
                'four-week pilot',
                'one organization',
                'up to five repos',
                'three delivery workflows',
                'onboarding and adaptation'
            ]
        },
        publicPlans: [
            {
                key: 'starter',
                displayName: 'Starter',
                salesMotion: 'assisted',
                priceEur: 699,
                billingInterval: 'monthly',
                repoLimit: 5,
                workflowLimit: 3,
                bySeat: false,
                byoAiKeysRequired: true,
                features: [
                    'hosted webhook and cron relay',
                    'basic run history',
                    'basic audit trail',
                    'email support'
                ]
            },
            {
                key: 'growth',
                displayName: 'Growth',
                salesMotion: 'assisted',
                priceEur: 1499,
                billingInterval: 'monthly',
                repoLimit: 20,
                workflowLimit: 3,
                bySeat: false,
                byoAiKeysRequired: true,
                features: [
                    'shared policy packs',
                    'centralized run history',
                    'usage analytics',
                    'priority support'
                ]
            },
            {
                key: 'enterprise',
                displayName: 'Enterprise',
                salesMotion: 'sales_led',
                priceEur: 5000,
                setupFeeEur: 2500,
                billingInterval: 'monthly',
                repoLimit: 50,
                workflowLimit: 3,
                bySeat: false,
                byoAiKeysRequired: true,
                features: [
                    'private runner',
                    'SSO',
                    'audit export',
                    'SLA and dedicated support'
                ]
            }
        ]
    },
    templates: [
        {
            key: 'issue_to_pr',
            name: 'Issue to PR',
            pipelinePath: 'pipeline/product-1/delivery.issue-to-pr.intent.json',
            humanApprovalStepId: 'review_patch',
            defaultTriggerModes: ['manual', 'webhook'],
            proofGoal: 'Show an issue moving to a reviewed PR with explicit approval.'
        },
        {
            key: 'pr_review_fix',
            name: 'PR Review Fix',
            pipelinePath: 'pipeline/product-1/delivery.pr-review-fix.intent.json',
            humanApprovalStepId: 'review_patch',
            defaultTriggerModes: ['manual', 'webhook'],
            proofGoal: 'Show a PR fix loop with human review before validation and push.'
        },
        {
            key: 'release_gate',
            name: 'Release Gate',
            pipelinePath: 'pipeline/product-1/delivery.release-gate.intent.json',
            humanApprovalStepId: 'human_gate',
            defaultTriggerModes: ['manual', 'cron', 'webhook'],
            proofGoal: 'Show QA and security checks ending in an explicit release approval.'
        }
    ],
    docs: {
        landingPage: 'docs/offers/leion-delivery-landing-page.md',
        pricing: 'docs/offers/leion-delivery-pricing.md',
        foundingPilot: 'docs/offers/leion-delivery-founding-pilot.md',
        securityFaq: 'docs/offers/leion-delivery-security-faq.md',
        onboardingChecklist: 'docs/offers/leion-delivery-onboarding-checklist.md',
        salesPlaybook: 'docs/sales/leion-delivery-founder-sales.md',
        proofScript: 'docs/proof/leion-delivery-demo-script.md'
    }
};
