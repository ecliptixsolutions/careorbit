export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string;
          created_by: string | null;
          doctor_id: string | null;
          duration_minutes: number;
          id: string;
          notes: string | null;
          patient_id: string;
          reason: string | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          doctor_id?: string | null;
          duration_minutes?: number;
          id?: string;
          notes?: string | null;
          patient_id: string;
          reason?: string | null;
          scheduled_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          doctor_id?: string | null;
          duration_minutes?: number;
          id?: string;
          notes?: string | null;
          patient_id?: string;
          reason?: string | null;
          scheduled_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          new_data: Json | null;
          old_data: Json | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
        };
        Relationships: [];
      };
      dispensations: {
        Row: {
          dispensed_at: string;
          dispensed_by: string | null;
          id: string;
          invoice_id: string | null;
          patient_id: string | null;
          pharmacy_item_id: string;
          prescription_id: string | null;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          dispensed_at?: string;
          dispensed_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          patient_id?: string | null;
          pharmacy_item_id: string;
          prescription_id?: string | null;
          quantity: number;
          unit_price?: number;
        };
        Update: {
          dispensed_at?: string;
          dispensed_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          patient_id?: string | null;
          pharmacy_item_id?: string;
          prescription_id?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dispensations_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispensations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispensations_pharmacy_item_id_fkey";
            columns: ["pharmacy_item_id"];
            isOneToOne: false;
            referencedRelation: "pharmacy_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispensations_prescription_id_fkey";
            columns: ["prescription_id"];
            isOneToOne: false;
            referencedRelation: "prescriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount_received: number;
          appointment_id: string | null;
          brand_snapshot: Json;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          change_due: number;
          cgst_amount: number;
          created_at: string;
          created_by: string | null;
          discount_amount: number;
          finalized_at: string | null;
          id: string;
          invoice_number: string;
          invoice_type: string;
          items: Json;
          notes: string | null;
          paid_amount: number;
          patient_id: string | null;
          sgst_amount: number;
          status: string;
          subtotal: number;
          tax_amount: number;
          total_amount: number;
          updated_at: string;
          updated_by: string | null;
          walk_in_name: string | null;
          walk_in_phone: string | null;
        };
        Insert: {
          amount_received?: number;
          appointment_id?: string | null;
          brand_snapshot?: Json;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          change_due?: number;
          cgst_amount?: number;
          created_at?: string;
          created_by?: string | null;
          discount_amount?: number;
          finalized_at?: string | null;
          id?: string;
          invoice_number?: string;
          invoice_type?: string;
          items?: Json;
          notes?: string | null;
          paid_amount?: number;
          patient_id?: string | null;
          sgst_amount?: number;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          total_amount?: number;
          updated_at?: string;
          updated_by?: string | null;
          walk_in_name?: string | null;
          walk_in_phone?: string | null;
        };
        Update: {
          amount_received?: number;
          appointment_id?: string | null;
          brand_snapshot?: Json;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          change_due?: number;
          cgst_amount?: number;
          created_at?: string;
          created_by?: string | null;
          discount_amount?: number;
          finalized_at?: string | null;
          id?: string;
          invoice_number?: string;
          invoice_type?: string;
          items?: Json;
          notes?: string | null;
          paid_amount?: number;
          patient_id?: string | null;
          sgst_amount?: number;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          total_amount?: number;
          updated_at?: string;
          updated_by?: string | null;
          walk_in_name?: string | null;
          walk_in_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      lab_orders: {
        Row: {
          appointment_id: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          id: string;
          order_number: string;
          ordered_at: string;
          ordered_by: string | null;
          patient_id: string;
          priority: string;
          reference_range: string | null;
          result: string | null;
          status: string;
          test_name: string;
          updated_at: string;
        };
        Insert: {
          appointment_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          id?: string;
          order_number?: string;
          ordered_at?: string;
          ordered_by?: string | null;
          patient_id: string;
          priority?: string;
          reference_range?: string | null;
          result?: string | null;
          status?: string;
          test_name: string;
          updated_at?: string;
        };
        Update: {
          appointment_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          id?: string;
          order_number?: string;
          ordered_at?: string;
          ordered_by?: string | null;
          patient_id?: string;
          priority?: string;
          reference_range?: string | null;
          result?: string | null;
          status?: string;
          test_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lab_orders_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          appointment_id: string | null;
          body: string;
          channel: string;
          created_at: string;
          id: string;
          metadata: Json;
          patient_id: string | null;
          read_at: string | null;
          recipient_id: string | null;
          recipient_phone: string | null;
          title: string;
        };
        Insert: {
          actor_id?: string | null;
          appointment_id?: string | null;
          body: string;
          channel?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          patient_id?: string | null;
          read_at?: string | null;
          recipient_id?: string | null;
          recipient_phone?: string | null;
          title: string;
        };
        Update: {
          actor_id?: string | null;
          appointment_id?: string | null;
          body?: string;
          channel?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          patient_id?: string | null;
          read_at?: string | null;
          recipient_id?: string | null;
          recipient_phone?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          id: string;
          invoice_id: string;
          method: string;
          paid_at: string;
          receipt_number: string;
          received_by: string | null;
          reference: string | null;
          notes: string | null;
        };
        Insert: {
          amount: number;
          id?: string;
          invoice_id: string;
          method: string;
          paid_at?: string;
          receipt_number?: string;
          received_by?: string | null;
          reference?: string | null;
          notes?: string | null;
        };
        Update: {
          amount?: number;
          id?: string;
          invoice_id?: string;
          method?: string;
          paid_at?: string;
          receipt_number?: string;
          received_by?: string | null;
          reference?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          address: string | null;
          allergies: string | null;
          blood_group: string | null;
          case_fee: number | null;
          created_at: string;
          created_by: string | null;
          date_of_birth: string | null;
          email: string | null;
          full_name: string;
          gender: string | null;
          id: string;
          mrn: string;
          notes: string | null;
          phone: string | null;
          sonography_fee: number | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          allergies?: string | null;
          blood_group?: string | null;
          case_fee?: number | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          email?: string | null;
          full_name: string;
          gender?: string | null;
          id?: string;
          mrn?: string;
          notes?: string | null;
          phone?: string | null;
          sonography_fee?: number | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          allergies?: string | null;
          blood_group?: string | null;
          case_fee?: number | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          email?: string | null;
          full_name?: string;
          gender?: string | null;
          id?: string;
          mrn?: string;
          notes?: string | null;
          phone?: string | null;
          sonography_fee?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pharmacy_items: {
        Row: {
          batch_number: string | null;
          created_at: string;
          created_by: string | null;
          expires_on: string | null;
          id: string;
          gst_rate: number;
          hsn_code: string | null;
          medicine_name: string;
          mrp: number;
          reorder_level: number;
          sku: string | null;
          stock_quantity: number;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          batch_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_on?: string | null;
          id?: string;
          gst_rate?: number;
          hsn_code?: string | null;
          medicine_name: string;
          mrp?: number;
          reorder_level?: number;
          sku?: string | null;
          stock_quantity?: number;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          batch_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_on?: string | null;
          id?: string;
          gst_rate?: number;
          hsn_code?: string | null;
          medicine_name?: string;
          mrp?: number;
          reorder_level?: number;
          sku?: string | null;
          stock_quantity?: number;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      pharmacy_invoice_items: {
        Row: {
          batch_number: string | null;
          created_at: string;
          discount_amount: number;
          discount_percent: number;
          expires_on: string | null;
          gst_rate: number;
          hsn_code: string | null;
          id: string;
          invoice_id: string;
          line_total: number;
          medicine_name: string;
          mrp: number;
          pharmacy_item_id: string | null;
          quantity: number;
          sku: string | null;
          tax_amount: number;
          taxable_amount: number;
          unit_price: number;
        };
        Insert: {
          batch_number?: string | null;
          created_at?: string;
          discount_amount?: number;
          discount_percent?: number;
          expires_on?: string | null;
          gst_rate?: number;
          hsn_code?: string | null;
          id?: string;
          invoice_id: string;
          line_total?: number;
          medicine_name: string;
          mrp: number;
          pharmacy_item_id?: string | null;
          quantity: number;
          sku?: string | null;
          tax_amount?: number;
          taxable_amount?: number;
          unit_price: number;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacy_invoice_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pharmacy_invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pharmacy_invoice_items_pharmacy_item_id_fkey";
            columns: ["pharmacy_item_id"];
            isOneToOne: false;
            referencedRelation: "pharmacy_items";
            referencedColumns: ["id"];
          },
        ];
      };
      prescriptions: {
        Row: {
          advice: string | null;
          appointment_id: string | null;
          created_at: string;
          created_by: string | null;
          diagnosis: string | null;
          doctor_id: string | null;
          id: string;
          issued_at: string | null;
          medicines: Json;
          patient_id: string;
          prescription_number: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          advice?: string | null;
          appointment_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          diagnosis?: string | null;
          doctor_id?: string | null;
          id?: string;
          issued_at?: string | null;
          medicines?: Json;
          patient_id: string;
          prescription_number?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          advice?: string | null;
          appointment_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          diagnosis?: string | null;
          doctor_id?: string | null;
          id?: string;
          issued_at?: string | null;
          medicines?: Json;
          patient_id?: string;
          prescription_number?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescriptions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          custom_role_label: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          organization: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          custom_role_label?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          organization?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          custom_role_label?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          organization?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_settings: {
        Row: {
          address_line_1: string | null;
          address_line_2: string | null;
          authorized_signatory: string | null;
          city: string | null;
          created_at: string;
          currency: string;
          drug_license_numbers: string[];
          email: string | null;
          gstin: string | null;
          hospital_name: string;
          id: string;
          invoice_footer: string | null;
          invoice_accent_color: string;
          invoice_prefix: string;
          invoice_terms: string | null;
          legal_name: string | null;
          logo_path: string | null;
          pan_registration: string | null;
          payment_details: string | null;
          postal_code: string | null;
          primary_phone: string | null;
          secondary_phone: string | null;
          state: string | null;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        Insert: {
          address_line_1?: string | null;
          address_line_2?: string | null;
          authorized_signatory?: string | null;
          city?: string | null;
          created_at?: string;
          currency?: string;
          drug_license_numbers?: string[];
          email?: string | null;
          gstin?: string | null;
          hospital_name?: string;
          id?: string;
          invoice_footer?: string | null;
          invoice_accent_color?: string;
          invoice_prefix?: string;
          invoice_terms?: string | null;
          legal_name?: string | null;
          logo_path?: string | null;
          pan_registration?: string | null;
          payment_details?: string | null;
          postal_code?: string | null;
          primary_phone?: string | null;
          secondary_phone?: string | null;
          state?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: Database["public"]["Tables"]["organization_settings"]["Insert"];
        Relationships: [];
      };
      service_catalog: {
        Row: {
          category: string | null;
          created_at: string;
          created_by: string | null;
          default_price: number;
          id: string;
          is_active: boolean;
          service_code: string;
          service_name: string;
          tax_rate: number;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_price?: number;
          id?: string;
          is_active?: boolean;
          service_code: string;
          service_name: string;
          tax_rate?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["service_catalog"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          created_at: string;
          created_by: string | null;
          error_rows: number;
          file_name: string;
          id: string;
          import_type: string;
          imported_rows: number;
          skipped_rows: number;
          summary: Json;
          total_rows: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          error_rows?: number;
          file_name: string;
          id?: string;
          import_type: string;
          imported_rows?: number;
          skipped_rows?: number;
          summary?: Json;
          total_rows?: number;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          custom_label: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          custom_label?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          custom_label?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_custom_role: {
        Args: {
          _label: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      dispense_medicine: {
        Args: {
          _patient_id: string;
          _pharmacy_item_id: string;
          _prescription_id: string | null;
          _quantity: number;
        };
        Returns: string;
      };
      create_pharmacy_bill: {
        Args: {
          _draft_id?: string | null;
          _items: Json;
          _notes?: string | null;
          _patient_id: string | null;
          _payment_amount?: number;
          _payment_method?: string;
          _payment_reference?: string | null;
          _save_as_draft?: boolean;
          _walk_in_name: string | null;
          _walk_in_phone: string | null;
        };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      record_invoice_payment: {
        Args: {
          _amount: number;
          _invoice_id: string;
          _method: string;
          _reference: string;
        };
        Returns: string;
      };
      finalize_invoice: {
        Args: { _invoice_id: string };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      cancel_invoice: {
        Args: { _invoice_id: string; _reason: string };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      import_patients: {
        Args: { _file_name: string; _rows: Json };
        Returns: Json;
      };
      import_pharmacy: {
        Args: { _file_name: string; _rows: Json; _update_existing?: boolean };
        Returns: Json;
      };
      import_services: {
        Args: { _file_name: string; _rows: Json };
        Returns: Json;
      };
      import_appointments: {
        Args: { _file_name: string; _rows: Json };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "admin" | "doctor" | "staff" | "custom";
      appointment_status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "doctor", "staff", "custom"],
      appointment_status: ["scheduled", "confirmed", "completed", "cancelled", "no_show"],
    },
  },
} as const;
