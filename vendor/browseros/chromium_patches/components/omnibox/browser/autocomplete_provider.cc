diff --git a/components/omnibox/browser/autocomplete_provider.cc b/components/omnibox/browser/autocomplete_provider.cc
--- a/components/omnibox/browser/autocomplete_provider.cc
+++ b/components/omnibox/browser/autocomplete_provider.cc
@@ -95,6 +95,8 @@ const char* AutocompleteProvider::TypeToString(Type type) {
       return "TabGroup";
     case TYPE_CROSS_DEVICE_TAB:
       return "CrossDeviceTab";
+    case TYPE_REDROB_AGENT:
+      return "RedrobAgent";
     default:
       DUMP_WILL_BE_NOTREACHED()
           << "Unhandled AutocompleteProvider::Type " << type;
@@ -213,6 +215,8 @@ AutocompleteProvider::AsOmniboxEventProviderType() const {
       return metrics::OmniboxEventProto::TAB_GROUP_PROVIDER;
     case TYPE_CROSS_DEVICE_TAB:
       return metrics::OmniboxEventProto::CROSS_DEVICE_TAB;
+    case TYPE_REDROB_AGENT:
+      return metrics::OmniboxEventProto::REDROB_AGENT;
     default:
       // TODO(crbug.com/40940012) This was a NOTREACHED that we converted to
       //   help debug crbug.com/1499235 since NOTREACHED's don't log their
