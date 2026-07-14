CREATE TYPE "public"."role" AS ENUM('advisor', 'senior_advisor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('platinum', 'gold', 'silver');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"memberId" integer NOT NULL,
	"supplierId" integer,
	"referenceNumber" varchar(128),
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"commissionExpected" varchar(64),
	"commissionReceived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"fileUrl" varchar(1024) NOT NULL,
	"documentType" varchar(64),
	"uploadedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) NOT NULL,
	"tier" "tier" DEFAULT 'gold' NOT NULL,
	"crmPersonId" varchar(64),
	"invitedByUserId" integer NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "member_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"memberId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) NOT NULL,
	"pinHash" varchar(255),
	"tier" "tier" DEFAULT 'gold' NOT NULL,
	"crmPersonId" varchar(64),
	"onboardingComplete" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invitedByUserId" integer,
	"stripeCustomerId" varchar(64),
	"stripeSubscriptionId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"travelRequestId" integer NOT NULL,
	"memberId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"totalPrice" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(128),
	"rating" integer,
	"contactEmail" varchar(320),
	"contactPhone" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"destination" varchar(255) NOT NULL,
	"dates" varchar(255) NOT NULL,
	"pax" integer NOT NULL,
	"budget" varchar(64),
	"notes" text,
	"status" "status" DEFAULT 'new' NOT NULL,
	"assignedToUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'advisor' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
